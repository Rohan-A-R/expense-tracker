import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '../../utils/formatters'

const INK = '#1B1710'
const PAPER = '#F5F0E4'
const ACCENT = '#D9481C'
const GREEN = '#4E9E6A'
const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function tint(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}
const compact = (v) => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v))
const dayLabel = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

const SECTION = 'text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2 mb-3'

export default function ReportTab({ report, categories }) {
  const r = report
  if (!r || (r.total === 0 && r.prevTotal === 0)) {
    return (
      <div className="py-20 text-center text-ink/40">
        <p className="font-serif-n text-2xl text-ink">Nothing to report</p>
        <p className="text-sm mt-1">Log some expenses first</p>
      </div>
    )
  }

  const pctUsed = r.budget > 0 ? Math.min((r.total / r.budget) * 100, 100) : null
  const over = r.budget > 0 && r.total > r.budget

  return (
    <div className="pb-6">

      {/* ═══ HERO — dark, like the portfolio dashboard ═══ */}
      <div className="rounded-[22px] px-5 pt-5 pb-4 mb-7 text-paper" style={{ background: INK, boxShadow: '0 18px 40px -14px rgba(27,23,16,.45)' }}>
        {r.isCurrent && r.safePerDay != null ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[9.5px] font-bold tracking-[2.5px] opacity-55">SAFE TO SPEND</div>
                <div className="font-serif-n text-[42px] leading-[1.1]">
                  {formatCurrency(r.safePerDay)}<span className="font-serif-i text-[19px] opacity-60 ml-1">a day</span>
                </div>
              </div>
              <div className="text-right pt-1">
                <div className="font-serif-n text-[21px] leading-tight">{r.daysLeft}</div>
                <div className="text-[9px] font-bold tracking-[1.5px] opacity-55">DAYS TO<br/>SALARY</div>
              </div>
            </div>

            {/* budget progress */}
            <div className="mt-4">
              <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(245,240,228,.16)' }}>
                <div className="h-full rounded-full" style={{ width: `${pctUsed}%`, background: over ? '#F0844F' : '#84C79B' }} />
              </div>
              <div className="flex justify-between mt-2 text-[11px]">
                <span className="opacity-65">{formatCurrency(r.total)} spent</span>
                <span className="font-bold" style={{ color: over ? '#F0844F' : '#84C79B' }}>
                  {over ? `${formatCurrency(r.total - r.budget)} over budget` : `${formatCurrency(r.remaining)} left`}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9.5px] font-bold tracking-[2.5px] opacity-55">{r.isCurrent ? 'SPENT SO FAR' : 'TOTAL SPENT'}</div>
              <div className="font-serif-n text-[42px] leading-[1.1]">{formatCurrency(r.total)}</div>
              <div className="text-[11.5px] opacity-60 mt-0.5">
                {r.isCurrent ? `day ${r.daysElapsed} of ${r.totalDays}` : `${formatCurrency(Math.round(r.total / r.totalDays))} a day on average`}
              </div>
            </div>
            {r.prevTotal > 0 && (
              <div className="text-right pt-1">
                <div className="font-serif-n text-[21px] leading-tight" style={{ color: r.total > r.prevTotal ? '#F0844F' : '#84C79B' }}>
                  {r.total > r.prevTotal ? '↑' : '↓'} {Math.abs(Math.round(((r.total - r.prevTotal) / r.prevTotal) * 100))}%
                </div>
                <div className="text-[9px] font-bold tracking-[1.5px] opacity-55">VS LAST<br/>MONTH</div>
              </div>
            )}
          </div>
        )}

        {/* pace strip */}
        {r.isCurrent && r.daysLeft > 0 && r.total > 0 && (
          <div className="mt-3.5 pt-3 flex items-baseline justify-between" style={{ borderTop: '1px solid rgba(245,240,228,.12)' }}>
            <span className="text-[10px] font-bold tracking-[1.5px] opacity-55">ON PACE FOR</span>
            <span className="font-serif-n text-[18px]">
              {formatCurrency(r.projected)}
              {r.budget > 0 && (
                <span className="font-sans text-[11px] font-bold ml-2" style={{ color: r.projected > r.budget ? '#F0844F' : '#84C79B' }}>
                  {r.projected > r.budget ? `↑ ${formatCurrency(r.projected - r.budget)} over` : '✓ within budget'}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ═══ THE RACE — cumulative this month vs last ═══ */}
      {r.race.some(p => p.prev != null) && (
        <div className="mb-7">
          <div className={SECTION}>THE RACE · VS LAST MONTH</div>
          <div className="flex items-center gap-4 mb-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/60">
              <span className="w-4 h-[2.5px] rounded" style={{ background: ACCENT }} /> this month
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/60">
              <span className="w-4 h-[2px] rounded" style={{ background: 'rgba(27,23,16,.35)' }} /> last month
            </span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={r.race} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="raceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="d" tick={{ fontSize: 9, fill: 'rgba(27,23,16,.4)', fontWeight: 700 }} tickLine={false} axisLine={{ stroke: 'rgba(27,23,16,.25)' }}
                ticks={[1, Math.round(r.totalDays / 2), r.totalDays]} tickFormatter={v => `day ${v}`} />
              <YAxis hide domain={[0, 'dataMax']} />
              <Tooltip content={<RaceTooltip />} cursor={{ stroke: 'rgba(27,23,16,.25)', strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="prev" stroke="rgba(27,23,16,.38)" strokeWidth={1.7} strokeDasharray="5 4" fill="none" connectNulls isAnimationActive={false} dot={false} />
              <Area type="monotone" dataKey="cur" stroke={ACCENT} strokeWidth={2.4} fill="url(#raceFill)" connectNulls isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-ink/45 mt-1">
            {raceVerdict(r)}
          </p>
        </div>
      )}

      {/* ═══ SPENDING CALENDAR ═══ */}
      <div className="mb-7">
        <div className={SECTION}>SPENDING CALENDAR</div>
        <div className="grid grid-cols-7 gap-[7px] mb-2">
          {DOWS.map((d, i) => <div key={i} className="text-center text-[9.5px] font-bold" style={{ color: i >= 5 ? tint(ACCENT, 0.7) : 'rgba(27,23,16,.4)' }}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-[7px]">
          {Array.from({ length: r.days[0]?.dow || 0 }, (_, i) => <div key={`b${i}`} />)}
          {r.days.map(d => {
            const heat = d.amount > 0 ? 0.14 + 0.8 * Math.pow(d.amount / r.maxDay, 0.6) : 0
            return (
              <div key={d.date} title={`${d.date} · ${formatCurrency(d.amount)}`}
                className="aspect-square rounded-[9px] flex items-center justify-center"
                style={{
                  background: d.future ? 'transparent' : d.amount > 0 ? tint(ACCENT, heat) : tint(GREEN, 0.14),
                  border: d.isToday ? `1.5px solid ${INK}` : d.future ? '1px dashed rgba(27,23,16,.14)' : 'none',
                }}>
                <span className="text-[10px] font-bold leading-none"
                  style={{ color: d.future ? 'rgba(27,23,16,.28)' : heat > 0.62 ? PAPER : d.amount === 0 ? GREEN : tint(INK, 0.72) }}>
                  {d.day}
                </span>
              </div>
            )
          })}
        </div>
        {/* stat strip under calendar */}
        <div className="flex mt-4 border border-ink/25 rounded-2xl overflow-hidden">
          <div className="flex-1 px-3 py-3 border-r border-ink/25 text-center">
            <div className="font-serif-n text-[20px] leading-tight" style={{ color: GREEN }}>{r.noSpendDays}</div>
            <div className="text-[9px] font-bold tracking-[1px] text-ink/50">NO-SPEND DAYS</div>
          </div>
          <div className="flex-1 px-3 py-3 border-r border-ink/25 text-center">
            <div className="font-serif-n text-[20px] leading-tight">{r.bestStreak}</div>
            <div className="text-[9px] font-bold tracking-[1px] text-ink/50">BEST STREAK</div>
          </div>
          <div className="flex-1 px-3 py-3 text-center">
            <div className="font-serif-n text-[20px] leading-tight">{formatCurrency(Math.round(r.total / Math.max(r.daysElapsed, 1)))}</div>
            <div className="text-[9px] font-bold tracking-[1px] text-ink/50">PER DAY</div>
          </div>
        </div>
      </div>

      {/* ═══ CATEGORY BUDGETS — which are at risk ═══ */}
      {r.catBudgets.length > 0 && (
        <div className="mb-7">
          <div className={SECTION}>CATEGORY BUDGETS</div>
          {r.catBudgets.map((b, i) => {
            const over = b.spent > b.limit
            const willOver = !over && r.isCurrent && b.pace > b.limit
            const barColor = over ? ACCENT : willOver ? '#C77A1B' : GREEN
            return (
              <div key={b.cat.id} className={`py-3 ${i < r.catBudgets.length - 1 ? 'rule-dot' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-sm shrink-0" style={{ background: tint(b.cat.color || '#A07C4E', 0.18) }}>{b.cat.icon}</div>
                  <span className="flex-1 text-sm font-semibold truncate">{b.cat.name}</span>
                  <span className="text-[12px] font-bold" style={{ color: barColor }}>
                    {over ? `${formatCurrency(b.spent - b.limit)} over`
                      : willOver ? `heading ${formatCurrency(Math.round(b.pace - b.limit))} over`
                      : `${formatCurrency(b.limit - b.spent)} left`}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 mt-2 ml-11">
                  <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(27,23,16,.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(b.pct, 100)}%`, background: barColor }} />
                  </div>
                  <span className="text-[10.5px] font-bold text-ink/45 w-14 text-right">{formatCurrency(b.spent)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ LITTLE THINGS ADD UP — repeated purchases ═══ */}
      {r.habits.length > 0 && (
        <div className="mb-7">
          <div className={SECTION}>LITTLE THINGS ADD UP</div>
          {r.habits.map((h, i) => (
            <div key={i} className={`flex items-center gap-3.5 py-3 ${i < r.habits.length - 1 ? 'rule-dot' : ''}`}>
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base shrink-0" style={{ background: tint(h.cat?.color || '#A07C4E', 0.18) }}>{h.cat?.icon || '📦'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate capitalize">{h.label || h.cat?.name || 'Expense'}</div>
                <div className="text-[11px] text-ink/45">{h.count} times · about {formatCurrency(Math.round(h.avg))} each</div>
              </div>
              <span className="font-serif-n text-[17px]">{formatCurrency(h.total)}</span>
            </div>
          ))}
          <p className="text-[11px] text-ink/45 pt-2.5">Bought 3+ times this month — skipping a few of these is the easiest way to save.</p>
        </div>
      )}

      {/* ═══ WHAT CHANGED ═══ */}
      {r.movers.length > 0 && (
        <div className="mb-7">
          <div className={SECTION}>WHAT CHANGED VS LAST MONTH</div>
          {r.movers.map((m, i) => {
            const up = m.delta > 0
            return (
              <div key={m.cat.id} className={`flex items-center gap-3.5 py-3 ${i < r.movers.length - 1 ? 'rule-dot' : ''}`}>
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base shrink-0" style={{ background: tint(m.cat.color || '#A07C4E', 0.18) }}>{m.cat.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{m.cat.name}</div>
                  <div className="text-[11px] text-ink/45">{formatCurrency(m.prev)} → {formatCurrency(m.now)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13.5px] font-bold" style={{ color: up ? ACCENT : GREEN }}>{up ? '↑' : '↓'} {formatCurrency(Math.abs(m.delta))}</div>
                  {m.pct != null && <div className="text-[10px] font-bold text-ink/40">{up ? '+' : ''}{m.pct}%</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

function raceVerdict(r) {
  const lastCur = [...r.race].reverse().find(p => p.cur != null)
  if (!lastCur) return ''
  const samePointPrev = r.race[r.race.findIndex(p => p.cur === lastCur.cur && p.d === lastCur.d)]?.prev
  if (samePointPrev == null) return ''
  const diff = lastCur.cur - samePointPrev
  if (Math.abs(diff) < Math.max(r.prevTotal * 0.03, 100)) return `Neck and neck with last month at day ${lastCur.d}.`
  return diff > 0
    ? `You're ${formatCurrency(diff)} ahead of last month's pace — slow down.`
    : `You're ${formatCurrency(-diff)} behind last month's pace — nice.`
}

function RaceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-paper border border-ink px-3 py-2 rounded-xl text-xs">
      <p className="text-ink/50 text-[10px] mb-1 font-bold">DAY {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="font-semibold" style={{ color: p.dataKey === 'cur' ? ACCENT : 'rgba(27,23,16,.55)' }}>
          {p.dataKey === 'cur' ? 'this month' : 'last month'} · {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}
