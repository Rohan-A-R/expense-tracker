import { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { useApp } from '../context/AppContext'
import Modal, { ConfirmModal } from '../components/ui/Modal'
import { formatCurrency } from '../utils/formatters'
import { computeNetWorth, assetValue, ASSET_TYPES, typeMeta, METALS, assetMetal, isMetalAsset, finenessOf } from '../utils/networth'

const todayISO = () => new Date().toISOString().split('T')[0]

const INK = '#1B1710'
const GREEN = '#4E9E6A'
const RUST = '#D9481C'
const onDark = (v) => v > 0 ? '#84C79B' : v < 0 ? '#F0844F' : '#F5F0E4'
const signed = (v) => `${v >= 0 ? '+' : '−'}${formatCurrency(Math.abs(v))}`

function tint(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

const LABEL = 'text-[11px] font-bold tracking-[2px] text-ink/55'

export default function NetWorth({ onOpenPortfolio, onOpenUdhaar }) {
  const { holdings, prices, udhaar, assets, netWorthSnaps, metalRates, addAsset, updateAsset, deleteAsset, refreshMetalRates } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)

  const nw = useMemo(() => computeNetWorth({ holdings, prices, assets, udhaar, metalRates }), [holdings, prices, assets, udhaar, metalRates])

  const empty = assets.length === 0 && holdings.length === 0 && udhaar.filter(u => u.status === 'open').length === 0

  // Breakdown rows (skip zero manual groups but always show investments + udhaar entry points)
  const bankCashAssets = assets.filter(a => typeMeta(a.type).group === 'bankCash')
  const otherAssets = assets.filter(a => typeMeta(a.type).group === 'others')
  const loanAssets = assets.filter(a => typeMeta(a.type).group === 'loans')

  return (
    <div className="min-h-screen bg-paper px-6 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-baseline justify-between rule-2 pb-3">
        <span className="font-serif-i text-[34px] leading-none">Net worth</span>
        <button onClick={() => setShowAdd(true)} className="px-3.5 py-2 rounded-xl bg-ink text-paper text-xs font-bold active:scale-95">+ Add</button>
      </div>

      {/* Hero — number + interactive stock-style trend chart */}
      {!empty && (
        <div className="mt-5 rounded-[22px] pt-5 pb-4 text-paper overflow-hidden" style={{ background: INK, boxShadow: '0 18px 40px -14px rgba(27,23,16,.45)' }}>
          <div className="px-5">
            <div className="text-[10px] font-bold tracking-[2px]" style={{ color: 'rgba(245,240,228,.55)' }}>NET WORTH</div>
            <div className="font-serif-n text-[46px] leading-[1.05] tracking-[-1px] mt-0.5" style={{ color: nw.total < 0 ? '#F0844F' : '#F5F0E4' }}>
              {formatCurrency(nw.total)}
            </div>
          </div>

          {netWorthSnaps.length >= 2 ? (
            <TrendChart snaps={netWorthSnaps} />
          ) : (
            <div className="px-5 mt-2 flex items-center gap-2">
              <span className="text-sm">📈</span>
              <p className="text-[12px] leading-snug" style={{ color: 'rgba(245,240,228,.5)' }}>
                Your trend chart starts building today — reopen the app over the coming days to watch it grow.
              </p>
            </div>
          )}

          <div className="flex mt-4 pt-4 mx-5" style={{ borderTop: '1px solid rgba(245,240,228,.15)' }}>
            <div className="flex-1">
              <div className="text-[9.5px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.5)' }}>YOU OWN</div>
              <div className="font-serif-n text-[19px] mt-0.5">{formatCurrency(nw.assetsTotal)}</div>
            </div>
            <div className="flex-1">
              <div className="text-[9.5px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.5)' }}>YOU OWE</div>
              <div className="font-serif-n text-[19px] mt-0.5" style={{ color: nw.liabilities > 0 ? '#F0844F' : '#F5F0E4' }}>{formatCurrency(nw.liabilities)}</div>
            </div>
          </div>
        </div>
      )}

      {empty && (
        <div className="py-14 text-center text-ink/40">
          <p className="font-serif-n text-2xl text-ink">Build your net worth</p>
          <p className="text-sm mt-1 mb-6">Add your bank balance, gold, loans —<br/>investments &amp; udhaar link in automatically</p>
          <button onClick={() => setShowAdd(true)} className="px-6 py-3.5 rounded-2xl bg-ink text-paper font-bold text-sm active:scale-95">+ Add your first</button>
        </div>
      )}

      {/* BREAKDOWN */}
      {!empty && (
        <div className="mt-7">
          <div className={`${LABEL} rule-ink pb-2 mb-1`}>BREAKDOWN</div>

          {/* Investments → Portfolio */}
          <LinkRow icon="📈" name="Investments" sub="Stocks & mutual funds" value={nw.investments} onClick={onOpenPortfolio} />

          {/* Udhaar → Udhaar ledger */}
          <LinkRow icon="🤝" name="Udhaar" value={nw.udhaarNet}
            sub={nw.udhaarReceivable > 0 || nw.udhaarPayable > 0
              ? [nw.udhaarReceivable > 0 ? `${formatCurrency(nw.udhaarReceivable)} to collect` : null,
                 nw.udhaarPayable > 0 ? `${formatCurrency(nw.udhaarPayable)} to pay` : null].filter(Boolean).join(' · ')
              : 'Lend & borrow ledger'}
            signedVal onClick={onOpenUdhaar} />

          {/* Bank & cash (legacy) */}
          {bankCashAssets.map(a => <AssetRow key={a.id} a={a} metalRates={metalRates} onEdit={() => setEdit(a)} />)}
          {/* Metals / FD / other */}
          {otherAssets.map(a => <AssetRow key={a.id} a={a} metalRates={metalRates} onEdit={() => setEdit(a)} />)}
          {/* Loans */}
          {loanAssets.map(a => <AssetRow key={a.id} a={a} metalRates={metalRates} onEdit={() => setEdit(a)} liability />)}

          <button onClick={() => setShowAdd(true)} className="w-full mt-4 py-3.5 rounded-2xl border border-ink/25 text-sm font-bold text-ink/70 active:scale-[0.98] transition-transform">
            + Add metal, FD, loan or other asset
          </button>
          <p className="text-center text-[11px] text-ink/40 pt-4">Investments &amp; udhaar update on their own · tap a row to edit</p>
        </div>
      )}

      <AssetForm open={showAdd} metalRates={metalRates} onClose={() => setShowAdd(false)}
        onSave={async (data) => {
          await addAsset(data); setShowAdd(false)
          const m = assetMetal(data)
          if (m && !metalRates[m]) refreshMetalRates([m]).catch(() => {})
        }} />
      <AssetForm open={!!edit} asset={edit} metalRates={metalRates} onClose={() => setEdit(null)}
        onSave={async (data) => {
          await updateAsset({ ...edit, ...data }); setEdit(null)
          const m = assetMetal(data)
          if (m && !metalRates[m]) refreshMetalRates([m]).catch(() => {})
        }}
        onDelete={() => { setDel(edit); setEdit(null) }} />

      <ConfirmModal
        isOpen={!!del} onClose={() => setDel(null)}
        onConfirm={() => { if (del) deleteAsset(del.id); setDel(null) }}
        title={`Remove ${del?.name || ''}?`}
        message="This removes it from your net worth. Nothing else is affected."
        confirmLabel="Remove" danger
      />
    </div>
  )
}

const RANGES = [
  { id: '1M', days: 30,   label: 'past month' },
  { id: '6M', days: 182,  label: 'past 6 months' },
  { id: '1Y', days: 365,  label: 'past year' },
  { id: '5Y', days: 1825, label: 'past 5 years' },
  { id: 'ALL', days: null, label: 'all time' },
]

// Stock-app style trend: range pills (1M/6M/1Y/5Y/ALL) + area chart, dark themed.
function TrendChart({ snaps }) {
  const [range, setRange] = useState('ALL')

  const { data, rangeChange, label } = useMemo(() => {
    const r = RANGES.find(x => x.id === range) || RANGES[4]
    const cutoff = r.days ? Date.now() - r.days * 86400000 : 0
    let filtered = snaps.filter(s => new Date(s.date + 'T00:00:00').getTime() >= cutoff)
    if (filtered.length < 2) filtered = snaps.slice(-2)   // fall back so a line always renders
    const pts = filtered.map(s => ({ date: s.date, total: s.total }))
    const flat = pts.length === 1 ? [pts[0], pts[0]] : pts
    let rc = null
    if (pts.length >= 2) {
      const first = pts[0].total, last = pts[pts.length - 1].total
      if (first !== last) rc = { diff: last - first, pct: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null }
    }
    return { data: flat, rangeChange: rc, label: r.label }
  }, [snaps, range])

  const color = rangeChange ? (rangeChange.diff >= 0 ? '#84C79B' : '#F0844F') : '#84C79B'
  const single = snaps.length < 2

  const fmtTick = (d) => {
    const dt = new Date(d + 'T00:00:00')
    return (range === '1M' || range === '6M')
      ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  }

  return (
    <div className="mt-2">
      {/* range change header */}
      <div className="px-5 h-5">
        {single ? (
          <span className="text-[12px]" style={{ color: 'rgba(245,240,228,.5)' }}>Trend builds as the days pass</span>
        ) : rangeChange ? (
          <span className="text-[12.5px] font-bold" style={{ color }}>
            {rangeChange.diff >= 0 ? '▲' : '▼'} {signed(rangeChange.diff)}
            {rangeChange.pct != null ? ` (${rangeChange.diff >= 0 ? '+' : '−'}${Math.abs(rangeChange.pct).toFixed(1)}%)` : ''}
            <span style={{ color: 'rgba(245,240,228,.4)' }}> · {label}</span>
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: 'rgba(245,240,228,.5)' }}>No change · {label}</span>
        )}
      </div>

      <div className="mt-1">
        <ResponsiveContainer width="100%" height={168}>
          <AreaChart data={data} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="nwTrend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.34} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={fmtTick} minTickGap={44}
              tick={{ fontSize: 9, fill: 'rgba(245,240,228,.45)', fontWeight: 700 }}
              tickLine={false} axisLine={false} />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            {!single && <Tooltip content={<NwTooltip dark />} cursor={{ stroke: 'rgba(245,240,228,.3)', strokeDasharray: '3 3' }} />}
            <Area type="monotone" dataKey="total" stroke={color} strokeWidth={2.4} fill="url(#nwTrend)" isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* range pills */}
      <div className="flex gap-1.5 px-5 mt-2">
        {RANGES.map(r => {
          const on = range === r.id
          return (
            <button key={r.id} onClick={() => setRange(r.id)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
              style={on
                ? { background: 'rgba(245,240,228,.16)', color: '#F5F0E4' }
                : { color: 'rgba(245,240,228,.45)' }}>
              {r.id}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LinkRow({ icon, name, sub, value, onClick, signedVal }) {
  const color = signedVal ? (value > 0 ? GREEN : value < 0 ? RUST : INK) : INK
  return (
    <button onClick={onClick} className="flex items-center gap-3.5 py-3.5 w-full text-left rule-dot">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base shrink-0" style={{ background: tint(INK, 0.06) }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-[11.5px] text-ink/50 truncate">{sub}</div>
      </div>
      <span className="font-serif-n text-[17px]" style={{ color }}>{signedVal ? signed(value) : formatCurrency(value)}</span>
      <span className="text-ink/35 text-lg ml-1">›</span>
    </button>
  )
}

const purityLabel = (a) => METALS[assetMetal(a)]?.purities.find(p => p.code === String(a.purity))?.label || `${a.purity}`

function assetSub(a, metalRates) {
  const metal = assetMetal(a)
  if (metal) {
    const rate = metalRates?.[metal]?.perGram
    const perG = rate ? rate * finenessOf(a) : null
    return `${METALS[metal].label} · ${a.grams} g · ${purityLabel(a)}${perG ? ` · ${formatCurrency(Math.round(perG))}/g` : ' · rate updating…'}`
  }
  if (a.type === 'fd') {
    const since = a.startDate ? ` · since ${new Date(a.startDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}` : ''
    return `${a.rate || 0}% p.a., quarterly${since}`
  }
  if (a.type === 'loan') {
    return `${a.emi ? `${formatCurrency(a.emi)}/mo` : 'no EMI set'}${a.rate ? ` · ${a.rate}%` : ''}`
  }
  return typeMeta(a.type).label
}

function AssetRow({ a, metalRates, onEdit, liability }) {
  const metal = assetMetal(a)
  const icon = metal ? METALS[metal].icon : typeMeta(a.type).icon
  const dynamic = metal || typeMeta(a.type).dynamic
  const val = assetValue(a, { metalRates })
  // Growth since the entered principal (FD only — gold has no stored cost basis here)
  const growth = a.type === 'fd' ? val - (Number(a.principal) || 0) : 0
  return (
    <button onClick={onEdit} className="flex items-center gap-3.5 py-3.5 w-full text-left rule-dot">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base shrink-0" style={{ background: tint(liability ? RUST : INK, liability ? 0.12 : 0.06) }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
          {a.name}
          {dynamic && <span className="shrink-0 text-[8.5px] font-bold text-ink/45 border border-ink/25 rounded px-1 py-px">LIVE</span>}
        </div>
        <div className="text-[11.5px] text-ink/50 truncate">{assetSub(a, metalRates)}</div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="font-serif-n text-[17px]" style={{ color: liability ? RUST : INK }}>
          {liability ? '−' : ''}{formatCurrency(Math.round(val))}
        </div>
        {growth > 0 && <div className="text-[10.5px] font-bold" style={{ color: GREEN }}>+{formatCurrency(Math.round(growth))} earned</div>}
      </div>
    </button>
  )
}

function NwTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2 rounded-xl text-sm"
      style={dark
        ? { background: '#F5F0E4', border: '1px solid #1B1710', color: '#1B1710' }
        : { background: '#F5F0E4', border: '1px solid #1B1710' }}>
      <p className="text-ink/50 text-[10px] mb-0.5 font-bold">{new Date(label + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
      <p className="font-serif-n text-lg">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

const FIELD = 'w-full py-3 bg-transparent rule-ink text-ink placeholder-ink/30 text-[15px] focus:outline-none'
const FLABEL = 'text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2'

function AssetForm({ open, asset, metalRates, onClose, onSave, onDelete }) {
  const editing = !!asset
  const [type, setType] = useState('metal')
  const [metal, setMetal] = useState('gold')
  const [f, setF] = useState({ name: '', value: '', grams: '', purity: '24', principal: '', rate: '', emi: '', startDate: todayISO() })
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  // Pick a metal inside the Metal type; snap purity to that metal's first option
  const pickMetal = (id) => { setMetal(id); set('purity', METALS[id].purities[0].code) }

  useEffect(() => {
    if (!open) return
    setType(asset?.type || 'metal')
    setMetal(assetMetal(asset || {}) || 'gold')
    setF({
      name: asset?.name || '',
      value: asset?.value != null ? String(asset.value) : '',
      grams: asset?.grams != null ? String(asset.grams) : '',
      purity: asset?.purity || '24',
      principal: asset?.principal != null ? String(asset.principal) : '',
      rate: asset?.rate != null ? String(asset.rate) : '',
      emi: asset?.emi != null ? String(asset.emi) : '',
      startDate: asset?.startDate || todayISO(),
    })
  }, [open, asset])

  const isMetalType = type === 'metal', isFd = type === 'fd', isLoan = type === 'loan'
  const isStatic = !isMetalType && !isFd && !isLoan
  const metalPurities = METALS[metal]?.purities || []

  // Live preview of the computed value
  const preview = useMemo(() => {
    const draft = { type, metal, name: f.name, value: Number(f.value), grams: Number(f.grams), purity: f.purity,
      principal: Number(f.principal), rate: Number(f.rate), emi: Number(f.emi), startDate: f.startDate }
    return assetValue(draft, { metalRates })
  }, [type, metal, f, metalRates])

  const rateReady = !isMetalType || !!metalRates?.[metal]?.perGram

  const valid =
    f.name.trim() && (
      isStatic    ? f.value !== '' && Number(f.value) >= 0 :
      isMetalType ? Number(f.grams) > 0 :
      isFd        ? Number(f.principal) > 0 && f.startDate :
      isLoan      ? Number(f.principal) > 0 && f.startDate : false
    )

  function build() {
    const base = { type, name: f.name.trim() }
    if (isMetalType) {
      const rate = metalRates?.[metal]?.perGram
      const fin = metalPurities.find(p => p.code === String(f.purity))?.f ?? 1
      return { ...base, metal, grams: Number(f.grams), purity: f.purity, value: rate ? Number(f.grams) * fin * rate : 0 }
    }
    if (isStatic) return { ...base, value: Number(f.value) }
    if (isFd)     return { ...base, principal: Number(f.principal), rate: Number(f.rate) || 0, startDate: f.startDate }
    if (isLoan)   return { ...base, principal: Number(f.principal), rate: Number(f.rate) || 0, emi: Number(f.emi) || 0, startDate: f.startDate }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={editing ? 'Edit entry' : 'Add to net worth'}>
      <div className="px-6 py-4 pb-8">
        <div className={FLABEL}>TYPE</div>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {ASSET_TYPES.map(t => {
            const on = type === t.id
            return (
              <button key={t.id} type="button" onClick={() => setType(t.id)}
                className="py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95"
                style={on ? { background: t.liability ? RUST : INK, color: '#F5F0E4' } : { border: '1.5px solid rgba(27,23,16,.18)' }}>
                <span className="text-base">{t.icon}</span>{t.label}
              </button>
            )
          })}
        </div>

        <div className={FLABEL}>NAME</div>
        <input type="text" value={f.name} onChange={e => set('name', e.target.value)}
          placeholder={isLoan ? 'e.g. Bike loan' : isMetalType ? `e.g. ${METALS[metal].label} jewellery` : isFd ? 'e.g. HDFC FD' : 'e.g. SBI savings'}
          className={`${FIELD} mb-5`} />

        {/* Static: bank / cash / other */}
        {isStatic && (
          <>
            <div className={FLABEL}>CURRENT VALUE (₹)</div>
            <input type="number" inputMode="decimal" value={f.value} onChange={e => set('value', e.target.value)} placeholder="0" className={`${FIELD} mb-2`} />
          </>
        )}

        {/* Metal: choose metal, then grams + purity → valued at live rate */}
        {isMetalType && (
          <>
            <div className={FLABEL}>METAL</div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {Object.entries(METALS).map(([id, mm]) => {
                const on = metal === id
                return (
                  <button key={id} type="button" onClick={() => pickMetal(id)}
                    className="py-2.5 rounded-xl text-[12.5px] font-bold flex items-center justify-center gap-1.5 active:scale-95"
                    style={on ? { background: INK, color: '#F5F0E4' } : { border: '1.5px solid rgba(27,23,16,.18)' }}>
                    <span className="text-base">{mm.icon}</span>{mm.label}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <div className={FLABEL}>WEIGHT (GRAMS)</div>
                <input type="number" inputMode="decimal" value={f.grams} onChange={e => set('grams', e.target.value)} placeholder="10" className={FIELD} />
              </div>
              <div className="w-32">
                <div className={FLABEL}>PURITY</div>
                <select value={f.purity} onChange={e => set('purity', e.target.value)} className={FIELD}>
                  {metalPurities.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[11.5px] text-ink/50 mb-2">Valued at the live {METALS[metal].label.toLowerCase()} rate — updates when you open the app.</p>
          </>
        )}

        {/* FD: principal + rate + start */}
        {isFd && (
          <>
            <div className={FLABEL}>PRINCIPAL DEPOSITED (₹)</div>
            <input type="number" inputMode="decimal" value={f.principal} onChange={e => set('principal', e.target.value)} placeholder="100000" className={`${FIELD} mb-4`} />
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <div className={FLABEL}>INTEREST RATE (% P.A.)</div>
                <input type="number" inputMode="decimal" value={f.rate} onChange={e => set('rate', e.target.value)} placeholder="7" className={FIELD} />
              </div>
              <div className="flex-1">
                <div className={FLABEL}>START DATE</div>
                <input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} className={FIELD} />
              </div>
            </div>
            <p className="text-[11.5px] text-ink/50 mb-2">Grows daily with quarterly compounding.</p>
          </>
        )}

        {/* Loan: outstanding + rate + EMI + start */}
        {isLoan && (
          <>
            <div className={FLABEL}>OUTSTANDING NOW (₹)</div>
            <input type="number" inputMode="decimal" value={f.principal} onChange={e => set('principal', e.target.value)} placeholder="200000" className={`${FIELD} mb-4`} />
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <div className={FLABEL}>RATE (% P.A.)</div>
                <input type="number" inputMode="decimal" value={f.rate} onChange={e => set('rate', e.target.value)} placeholder="9" className={FIELD} />
              </div>
              <div className="flex-1">
                <div className={FLABEL}>MONTHLY EMI (₹)</div>
                <input type="number" inputMode="decimal" value={f.emi} onChange={e => set('emi', e.target.value)} placeholder="5000" className={FIELD} />
              </div>
            </div>
            <div className={FLABEL}>STARTED FROM</div>
            <input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} className={`${FIELD} mb-2`} />
            <p className="text-[11.5px] text-ink/50 mb-2">Shrinks each month as EMIs are paid. Leave EMI blank to keep it fixed.</p>
          </>
        )}

        {/* Live value preview */}
        {!isStatic && valid && (
          <div className="flex items-baseline justify-between p-3.5 rounded-2xl mb-4 mt-1" style={{ background: tint(isLoan ? RUST : INK, 0.06) }}>
            <span className="text-[11px] font-bold tracking-[1px] text-ink/55">{isLoan ? 'OUTSTANDING TODAY' : 'VALUE TODAY'}</span>
            <span className="font-serif-n text-[20px]" style={{ color: isLoan ? RUST : INK }}>
              {isMetalType && !rateReady ? 'rate loading…' : formatCurrency(Math.round(preview))}
            </span>
          </div>
        )}

        <div className="flex gap-3 mt-3">
          {editing && (
            <button onClick={onDelete} className="px-5 py-4 rounded-2xl border-[1.5px] border-brand text-brand font-bold text-[15px] active:scale-[0.98]">Remove</button>
          )}
          <button onClick={() => onSave(build())} disabled={!valid}
            className="flex-1 py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40">
            {editing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
