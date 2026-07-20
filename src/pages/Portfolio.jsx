import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import Modal, { ConfirmModal } from '../components/ui/Modal'
import { formatCurrency } from '../utils/formatters'
import { searchStock, searchMf, priceKey } from '../services/marketData'
import HoldingDetail from '../components/portfolio/HoldingDetail'

const GREEN = '#4E9E6A'
const RUST = '#D9481C'

function pnlColor(v) { return v > 0 ? GREEN : v < 0 ? RUST : '#1B1710' }
function onDark(v) { return v > 0 ? '#84C79B' : v < 0 ? '#F0844F' : '#F5F0E4' }
function signed(v) { return `${v >= 0 ? '+' : '−'}${formatCurrency(Math.abs(v))}` }

function Chip({ up, label, pct, dark }) {
  const c = dark ? onDark(up ? 1 : -1) : pnlColor(up ? 1 : -1)
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-full"
      style={{ color: c, background: dark ? 'rgba(245,240,228,.1)' : 'rgba(27,23,16,.05)' }}>
      {up ? '▲' : '▼'} {label}{pct != null ? ` ${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%` : ''}
    </span>
  )
}

function Legend({ color, label, pct }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-[11.5px] text-ink/60 font-semibold">{label} {pct}%</span>
    </div>
  )
}

export default function Portfolio({ onBack }) {
  const { holdings, prices, pricesUpdatedAt, pricesLoading, addHolding, updateHolding, deleteHolding, refreshPrices } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [detail, setDetail] = useState(null)

  const rows = useMemo(() => holdings.map(h => {
    const p = prices[priceKey(h)]
    const invested = Number(h.qty) * Number(h.avgBuy)
    const current = p ? Number(h.qty) * p.price : null
    const pnl = current != null ? current - invested : null
    const dayChange = p ? Number(h.qty) * (p.price - p.prevClose) : null
    return { h, p, invested, current, pnl, dayChange }
  }), [holdings, prices])

  const totals = useMemo(() => {
    let invested = 0, current = 0, day = 0, prevValue = 0, priced = true
    rows.forEach(r => {
      invested += r.invested
      if (r.current != null) {
        current += r.current; day += r.dayChange
        prevValue += r.current - r.dayChange
      } else priced = false
    })
    return {
      invested, current, pnl: current - invested, day, allPriced: priced,
      pnlPct: invested > 0 ? ((current - invested) / invested) * 100 : null,
      dayPct: prevValue > 0 ? (day / prevValue) * 100 : null,
    }
  }, [rows])

  // Stocks vs mutual funds split by current value
  const alloc = useMemo(() => {
    let stock = 0, mf = 0
    rows.forEach(r => { if (r.current != null) (r.h.kind === 'mf' ? (mf += r.current) : (stock += r.current)) })
    return { stock, mf, total: stock + mf }
  }, [rows])

  const updatedLabel = pricesUpdatedAt
    ? new Date(pricesUpdatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : 'never'

  return (
    <div className="min-h-screen bg-paper px-6 pt-14 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 rule-2 pb-3">
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-xl border-[1.5px] border-ink flex items-center justify-center text-lg active:scale-90">←</button>
        <span className="font-serif-i text-[28px] leading-none flex-1">Portfolio</span>
        <button onClick={() => setShowAdd(true)} className="px-3.5 py-2.5 rounded-xl bg-ink text-paper text-xs font-bold active:scale-95">+ Add</button>
      </div>

      {holdings.length === 0 ? (
        <div className="py-20 text-center text-ink/40">
          <p className="font-serif-n text-2xl text-ink">Track your investments</p>
          <p className="text-sm mt-1 mb-6">Add the stocks &amp; mutual funds you hold<br/>— prices update when you open the app</p>
          <button onClick={() => setShowAdd(true)} className="px-6 py-3.5 rounded-2xl bg-ink text-paper font-bold text-sm active:scale-95">+ Add holding</button>
        </div>
      ) : (
        <>
          {/* Hero card — stock-app style */}
          <div className="mt-4 rounded-[22px] p-5 text-paper" style={{ background: '#1B1710' }}>
            <div className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.55)' }}>CURRENT VALUE</div>
            <div className="font-serif-n text-[46px] leading-[1.05] tracking-[-1px] mt-0.5">
              {totals.allPriced || totals.current > 0 ? formatCurrency(totals.current) : '—'}
            </div>
            <div className="flex gap-2 mt-2.5">
              <Chip dark up={totals.day >= 0} label={`${signed(totals.day)} today`} pct={totals.dayPct} />
              <Chip dark up={totals.pnl >= 0} label="total" pct={totals.pnlPct} />
            </div>
            <div className="flex mt-4 pt-4" style={{ borderTop: '1px solid rgba(245,240,228,.15)' }}>
              <div className="flex-1">
                <div className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.5)' }}>INVESTED</div>
                <div className="font-serif-n text-xl mt-0.5">{formatCurrency(totals.invested)}</div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.5)' }}>TOTAL RETURNS</div>
                <div className="font-serif-n text-xl mt-0.5" style={{ color: onDark(totals.pnl) }}>{signed(totals.pnl)}</div>
              </div>
            </div>
          </div>

          {/* Allocation bar */}
          {alloc.total > 0 && (
            <div className="mt-4">
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(27,23,16,.1)' }}>
                {alloc.stock > 0 && <div style={{ width: `${(alloc.stock / alloc.total) * 100}%`, background: '#1B1710' }} />}
                {alloc.mf > 0 && <div style={{ width: `${(alloc.mf / alloc.total) * 100}%`, background: '#D9481C' }} />}
              </div>
              <div className="flex gap-4 mt-2">
                <Legend color="#1B1710" label="Stocks" pct={Math.round((alloc.stock / alloc.total) * 100)} />
                <Legend color="#D9481C" label="Mutual funds" pct={Math.round((alloc.mf / alloc.total) * 100)} />
              </div>
            </div>
          )}

          {/* Holdings header */}
          <div className="flex items-center justify-between rule-ink pb-2 mt-6 mb-1">
            <span className="text-[11px] font-bold tracking-[2px] text-ink/55">HOLDINGS · {rows.length}</span>
            <button onClick={() => refreshPrices(holdings)} disabled={pricesLoading} className="text-xs font-bold text-brand disabled:opacity-50">
              {pricesLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
          <div className="text-[10.5px] text-ink/40 mb-1">Updated {updatedLabel}</div>

          {/* Holdings rows */}
          {rows.map(({ h, p, invested, current, pnl }) => {
            const pnlPct = invested > 0 && pnl != null ? (pnl / invested) * 100 : null
            const dayPct = p && p.prevClose > 0 ? ((p.price - p.prevClose) / p.prevClose) * 100 : null
            return (
              <div key={h.id} className="flex items-stretch gap-3 py-3.5 rule-dot">
                <button onClick={() => setDetail(h)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: pnl == null ? 'rgba(27,23,16,.15)' : pnlColor(pnl) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{h.name}</span>
                      {h.sip?.amount > 0 && <span className="shrink-0 text-[9px] font-bold text-brand border border-brand/40 rounded px-1 py-px">SIP</span>}
                    </div>
                    <div className="text-[11.5px] text-ink/50 truncate mt-0.5">
                      {h.kind === 'mf' ? `${Number(h.qty).toFixed(2)} units` : `${h.qty} qty`} · avg {formatCurrency(h.avgBuy)}
                      {p ? ` · ${h.kind === 'mf' ? 'NAV ' : 'LTP '}${formatCurrency(p.price)}` : ''}
                      {h.sip?.amount > 0 ? ` · ${formatCurrency(h.sip.amount)}/mo` : ''}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap pl-2">
                    <div className="font-serif-n text-[17px]">{current != null ? formatCurrency(current) : '—'}</div>
                    {pnl != null
                      ? <div className="text-[11.5px] font-bold" style={{ color: pnlColor(pnl) }}>
                          {signed(pnl)}{pnlPct != null ? ` (${pnl >= 0 ? '+' : '−'}${Math.abs(pnlPct).toFixed(1)}%)` : ''}
                        </div>
                      : <div className="text-[11px] text-ink/40">price on device</div>}
                    {dayPct != null && (
                      <div className="text-[10px] font-semibold" style={{ color: pnlColor(dayPct) }}>
                        {dayPct >= 0 ? '▲' : '▼'} {Math.abs(dayPct).toFixed(2)}% today
                      </div>
                    )}
                  </div>
                </button>
                <button onClick={() => setDel(h)} aria-label="Remove" className="text-[13px] opacity-30 active:opacity-70 self-center p-1">🗑</button>
              </div>
            )
          })}
          <p className="text-center text-[11px] text-ink/40 pt-5">
            Tap a holding for full details · stock prices via Yahoo · MF NAV via AMFI
          </p>
        </>
      )}

      <AddHolding open={showAdd} holdings={holdings} onClose={() => setShowAdd(false)}
        onSave={async (h) => { const saved = await addHolding(h); refreshPrices([saved, ...holdings]); setShowAdd(false) }} />

      {detail && (
        <HoldingDetail
          holding={holdings.find(h => h.id === detail.id) || detail}
          onBack={() => setDetail(null)}
          onEdit={(h) => setEdit(h)}
          onDelete={(h) => { setDetail(null); setDel(h) }}
        />
      )}

      <EditHolding holding={edit} onClose={() => setEdit(null)}
        onSave={async (h, vals) => { await updateHolding(h, vals); setEdit(null) }}
        onDelete={(h) => { setEdit(null); setDel(h) }} />

      <ConfirmModal
        isOpen={!!del} onClose={() => setDel(null)}
        onConfirm={() => { if (del) deleteHolding(del.id); setDel(null) }}
        title="Remove holding?"
        message={del ? `Remove ${del.name} from your portfolio? Your other data is unaffected.` : ''}
        confirmLabel="Remove" danger
      />
    </div>
  )
}

// Edit units / avg buy — for corrections and partial sells
function EditHolding({ holding, onClose, onSave, onDelete }) {
  const [qty, setQty] = useState('')
  const [avg, setAvg] = useState('')
  const [sipAmount, setSipAmount] = useState('')
  const [sipDay, setSipDay] = useState('5')
  useEffect(() => {
    if (holding) {
      setQty(String(holding.qty)); setAvg(String(holding.avgBuy))
      setSipAmount(holding.sip?.amount ? String(holding.sip.amount) : '')
      setSipDay(String(holding.sip?.day || 5))
    }
  }, [holding])
  if (!holding) return null
  const valid = qty && Number(qty) > 0 && avg && Number(avg) > 0
  const isMf = holding.kind === 'mf'

  function buildSip() {
    if (!isMf) return undefined
    if (!sipAmount || Number(sipAmount) <= 0) return null   // null = disable SIP
    return {
      amount: Number(sipAmount),
      day: Math.min(Math.max(Number(sipDay) || 1, 1), 28),
      // keep prior lastRun so we don't re-apply old months; else start from this month
      lastRun: holding.sip?.lastRun || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    }
  }
  return (
    <Modal isOpen={!!holding} onClose={onClose} title="Edit holding">
      <div className="px-6 py-4 pb-8">
        <div className="p-4 border border-ink/25 rounded-2xl mb-5">
          <div className="text-[15px] font-bold leading-snug">{holding.name}</div>
          <div className="text-[11px] font-bold text-ink/45 mt-0.5">{holding.symbol || `AMFI ${holding.schemeCode}`}</div>
        </div>
        <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">{isMf ? 'UNITS HELD' : 'QUANTITY'}</div>
        <input type="number" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)}
          className="w-full py-3 mb-5 bg-transparent rule-ink text-ink text-[15px] focus:outline-none" />
        <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">{isMf ? 'AVG BUY NAV (₹)' : 'AVG BUY PRICE (₹)'}</div>
        <input type="number" inputMode="decimal" value={avg} onChange={e => setAvg(e.target.value)}
          className="w-full py-3 mb-3 bg-transparent rule-ink text-ink text-[15px] focus:outline-none" />
        <p className="text-[11.5px] text-ink/50 mb-5">Sold some? Lower the quantity. To buy more, use “+ Add” — it averages automatically.</p>

        {isMf && (
          <div className="border border-ink/20 rounded-2xl p-4 mb-6">
            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-1">MONTHLY SIP</div>
            <p className="text-[11.5px] text-ink/50 mb-3">Set an amount to auto-add units monthly · clear it to stop the SIP.</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-ink/45 mb-1">AMOUNT ₹</div>
                <input type="number" inputMode="decimal" value={sipAmount} onChange={e => setSipAmount(e.target.value)} placeholder="0 = off"
                  className="w-full py-2.5 bg-transparent rule-ink text-ink placeholder-ink/30 text-[15px] focus:outline-none" />
              </div>
              <div className="w-24">
                <div className="text-[10px] font-bold text-ink/45 mb-1">ON DAY</div>
                <select value={sipDay} onChange={e => setSipDay(e.target.value)}
                  className="w-full py-2.5 bg-transparent rule-ink text-ink text-[15px] focus:outline-none">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => onDelete(holding)} className="px-5 py-4 rounded-2xl border-[1.5px] border-brand text-brand font-bold text-[15px] active:scale-[0.98]">Remove</button>
          <button onClick={() => onSave(holding, { qty, avgBuy: avg, sip: buildSip() })} disabled={!valid}
            className="flex-1 py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40">Save changes</button>
        </div>
      </div>
    </Modal>
  )
}

function AddHolding({ open, holdings = [], onClose, onSave }) {
  const [kind, setKind] = useState('stock')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null) // { symbol|schemeCode, name }
  const [qty, setQty] = useState('')
  const [avg, setAvg] = useState('')
  const [sipAmount, setSipAmount] = useState('')
  const [sipDay, setSipDay] = useState('5')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const owned = picked && holdings.find(h => h.kind === kind && (kind === 'mf' ? h.schemeCode === picked.schemeCode : h.symbol === picked.symbol))

  function reset() {
    setKind('stock'); setQuery(''); setResults([]); setPicked(null); setQty(''); setAvg(''); setSipAmount(''); setSipDay('5'); setErr('')
  }
  function close() { reset(); onClose() }

  async function runSearch() {
    if (query.trim().length < 2) return
    setSearching(true); setErr(''); setResults([])
    try {
      setResults(kind === 'mf' ? await searchMf(query.trim()) : await searchStock(query.trim()))
    } catch { setErr('Search needs internet — works in the installed app.') }
    setSearching(false)
  }

  async function save() {
    if (!picked || !qty || Number(qty) <= 0 || !avg || Number(avg) <= 0) return
    setSaving(true)
    try {
      let sip = null
      if (kind === 'mf' && sipAmount && Number(sipAmount) > 0) {
        const now = new Date()
        sip = {
          amount: Number(sipAmount),
          day: Math.min(Math.max(Number(sipDay) || 1, 1), 28),
          lastRun: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, // starts next month
        }
      }
      const base = { kind, name: picked.name, qty: Number(qty), avgBuy: Number(avg), ...(sip ? { sip } : {}) }
      await onSave(kind === 'mf' ? { ...base, schemeCode: picked.schemeCode } : { ...base, symbol: picked.symbol })
      reset()
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={open} onClose={close} title="Add holding">
      <div className="px-6 py-4 pb-8">
        {/* kind toggle */}
        <div className="flex gap-2 mb-5">
          {[{ id: 'stock', label: 'Stock' }, { id: 'mf', label: 'Mutual fund' }].map(k => {
            const on = kind === k.id
            return (
              <button key={k.id} type="button" onClick={() => { setKind(k.id); setPicked(null); setResults([]); setQuery('') }}
                className="flex-1 py-3 rounded-2xl text-[13.5px] font-bold active:scale-[0.98]"
                style={on ? { background: '#1B1710', color: '#F5F0E4' } : { border: '1.5px solid rgba(27,23,16,.2)' }}>
                {k.label}
              </button>
            )
          })}
        </div>

        {!picked ? (
          <>
            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">
              {kind === 'mf' ? 'SEARCH MUTUAL FUND' : 'SEARCH STOCK (NSE / BSE)'}
            </div>
            <div className="flex gap-2 mb-4">
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder={kind === 'mf' ? 'e.g. Parag Parikh Flexi' : 'e.g. Reliance, TCS'}
                className="flex-1 py-3 bg-transparent rule-ink text-ink placeholder-ink/40 text-[15px] focus:outline-none" />
              <button onClick={runSearch} disabled={query.trim().length < 2 || searching}
                className="px-4 rounded-xl bg-ink text-paper text-xs font-bold active:scale-95 disabled:opacity-40">
                {searching ? '…' : 'Search'}
              </button>
            </div>
            {err && <p className="text-[12.5px] text-brand mb-3">{err}</p>}
            <div className="max-h-60 overflow-y-auto scrollbar-hide">
              {results.map((r, i) => (
                <button key={i} onClick={() => setPicked(r)} className="flex items-center gap-2 py-2.5 w-full text-left rule-dot">
                  <span className="flex-1 text-[13.5px] font-semibold">{r.name}</span>
                  {r.symbol && <span className="text-[11px] font-bold text-ink/45">{r.symbol}</span>}
                </button>
              ))}
              {!searching && !results.length && query && !err && <p className="text-sm text-ink/45 py-3">No matches — try another name.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between p-4 border border-ink/25 rounded-2xl mb-5">
              <div className="min-w-0 pr-2">
                <div className="text-[15px] font-bold leading-snug">{picked.name}</div>
                <div className="text-[11px] font-bold text-ink/45 mt-0.5">{picked.symbol || `AMFI ${picked.schemeCode}`}</div>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs font-bold text-brand shrink-0">Change</button>
            </div>

            {owned && (
              <div className="flex items-start gap-2 p-3 mb-5 rounded-xl" style={{ background: 'rgba(78,158,106,.12)' }}>
                <span className="text-sm">➕</span>
                <p className="text-[12px] text-ink/70 leading-snug">
                  You already hold <b>{owned.qty}</b> {kind === 'mf' ? 'units' : 'shares'} at avg {formatCurrency(owned.avgBuy)}.
                  This adds to it and recalculates your average buy price.
                </p>
              </div>
            )}

            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">{owned ? (kind === 'mf' ? 'UNITS BOUGHT NOW' : 'QUANTITY BOUGHT NOW') : (kind === 'mf' ? 'UNITS HELD' : 'QUANTITY')}</div>
            <input type="number" inputMode="decimal" autoFocus value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
              className="w-full py-3 mb-5 bg-transparent rule-ink text-ink placeholder-ink/30 text-[15px] focus:outline-none" />

            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">{owned ? 'BUY PRICE NOW (₹)' : (kind === 'mf' ? 'AVG BUY NAV (₹)' : 'AVG BUY PRICE (₹)')}</div>
            <input type="number" inputMode="decimal" value={avg} onChange={e => setAvg(e.target.value)} placeholder="0"
              className="w-full py-3 mb-6 bg-transparent rule-ink text-ink placeholder-ink/30 text-[15px] focus:outline-none" />

            {kind === 'mf' && !owned && (
              <div className="border border-ink/20 rounded-2xl p-4 mb-6">
                <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-1">MONTHLY SIP (OPTIONAL)</div>
                <p className="text-[11.5px] text-ink/50 mb-3">Auto-adds units every month at that day's NAV, starting next month.</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-ink/45 mb-1">AMOUNT ₹</div>
                    <input type="number" inputMode="decimal" value={sipAmount} onChange={e => setSipAmount(e.target.value)} placeholder="5000"
                      className="w-full py-2.5 bg-transparent rule-ink text-ink placeholder-ink/30 text-[15px] focus:outline-none" />
                  </div>
                  <div className="w-24">
                    <div className="text-[10px] font-bold text-ink/45 mb-1">ON DAY</div>
                    <select value={sipDay} onChange={e => setSipDay(e.target.value)}
                      className="w-full py-2.5 bg-transparent rule-ink text-ink text-[15px] focus:outline-none">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <button onClick={save} disabled={!qty || Number(qty) <= 0 || !avg || Number(avg) <= 0 || saving}
              className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40">
              {saving ? 'Saving…' : owned ? 'Average into holding' : 'Add to portfolio'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
