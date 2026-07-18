# Finances — App Design & Feature Context

Full description of what the app currently is — screens, layouts, data models, flows, and the design system. Use this as the single reference for how the app looks and behaves today.

> Note: an earlier version of this file described a dark/green theme, a light-mode toggle, and an SMS-import feature. **All of that is gone.** The app now uses the editorial "paper" theme described below, is light-only, and has no SMS feature. It has also grown well beyond expense tracking into a full personal-finance app.

## What the app is

A **private, offline-first personal-finance Android app** for an Indian user (currency ₹, UPI-heavy). React 18 + Vite 5 + TailwindCSS 3 + Recharts, wrapped in Capacitor 6 for Android. 100% offline — all data in IndexedDB on-device, no backend, no accounts, no analytics. Single user. Mobile-only portrait layout (`max-w-lg`, ~512px centered). Beyond expenses it covers investments, gold/FD/loans, lending (udhaar), and net worth.

## Design language (editorial "paper" theme)

- **Light-only**, warm and editorial — feels like a print magazine / paper ledger, not a fintech dashboard.
- **Palette:** paper `#F5F0E4` (canvas), ink `#1B1710` (near-black, warm), rust/brand `#D9481C` (accent), green `#4E9E6A` (positive). On dark ("ink") surfaces: green `#84C79B`, rust `#F0844F`. Optional gold `#C9972E`.
- **Typography:** **DM Sans** (body) + **Instrument Serif** (display) via Google Fonts. Utility classes in `src/index.css`: `.font-serif-i` (italic display headings), `.font-serif-n` (numerals/display), `.rule` / `.rule-ink` / `.rule-2` / `.rule-dot` (hairline dividers). Big numbers are set in the serif.
- **Surfaces:** flat with hairline `ink/25` borders and thin rules rather than heavy shadows; key "hero" cards are solid **ink** (`#1B1710`) with paper text — used on Dashboard portfolio card, Portfolio, Net worth, and the Report tab.
- Rounded corners (`rounded-2xl`/`rounded-[22px]`), emoji + inline-SVG icons, `active:scale` touch feedback, safe-area padding.
- A small `tint(hex, alpha)` helper (duplicated per-file by design) produces translucent category/accent fills.
- Bottom tab bar (5 tabs) + a floating **+** FAB (bottom-right) for Add Expense.
- Forms are **bottom-sheet modals**.

## Navigation

**Bottom nav (5 tabs):** HOME · STATS · MONEY · BUDGET · SETTINGS.
**Sub-pages (full-screen, own back button, not in the tab bar):** Spends (expense list), Portfolio, Udhaar — each remembers the tab it was opened from and keeps that tab highlighted.
**Global FAB:** "+" opens the Add Expense sheet; hidden on Settings, Portfolio, Udhaar and Net worth.

---

## Screen — Dashboard (HOME)

- Header: "Finances" (serif italic) + active financial-month label.
- **Total spent** for the month (huge serif ₹) with a stat row: This week · Daily avg · Entries.
- **Udhaar strip** (dismissible, reappears weekly): shows gross "₹X to collect · ₹Y to pay" (never nets different people). When nothing is tracked, a weekly discovery nudge instead.
- **Portfolio mini-card** (ink): current value + P&L% + today's change; taps into Portfolio. Falls back to "Track your stocks & mutual funds" when empty.
- **Budget progress** (if set): % used, color green → orange (≥70%) → red (≥90%), remaining.
- **Top category** of the month.
- **Recent** transactions + a "See all spends →" link and a "See all N spends" button → Spends page.

## Screen — Spends (expense list, sub-page)

Back button; search (description); month + category filter chips; sort (date/amount); date-grouped expense cards with per-day totals; tap to edit; empty state.

## Screen — Analysis (STATS)

Tabs: **Breakdown · Trends · Monthly · Report** + a month selector.
- **Breakdown:** donut of category spend + ranked list with % bars.
- **Trends:** per-category spend across the last 5 months as compact spark-bars with ↑↓ vs last month; users can **add/remove categories** inline (no limit).
- **Monthly:** 6-month bar chart with an average reference line + this-month headline and Highest / Avg-per-month / Total stats (average honestly computed only over months with data).
- **Report:** the flagship insights tab — an ink **hero** with *safe-to-spend per day* (or spent-so-far), budget bar and an "on pace for" projection; **"The Race"** cumulative line vs last month; a **spending-calendar heatmap** (per-day, no-spend days, best streak); **category budgets** with pace-based "heading over" warnings; and **"little things add up"** (items bought 3+ times). All financial-month aware.

## Screen — Budget

Active-month header; monthly budget card (spent vs budget, colored progress, remaining, inline edit); per-category budgets each with their own progress.

## Screen — Money / Net worth (MONEY tab)

The hub that ties everything together.
- **Ink hero:** big **net worth** number (rust if negative), You own / You owe split.
- **Trend:** once ≥2 daily snapshots exist, a **stock-app-style area chart** with range pills **1M · 6M · 1Y · 5Y · ALL** and a range-specific ▲/▼ return. Before that, a compact "trend builds as days pass" note (no empty chart).
- **Breakdown rows:** Investments (live portfolio value → opens Portfolio), Udhaar (net, → ledger), plus manual **assets**.
- **+ Add asset** modal — types: **Metal** (Gold/Silver/Platinum selector + weight + purity, live-valued), **Fixed deposit** (principal + rate + date → auto-compounds), **Loan/due** (outstanding + rate + EMI + date → auto-amortizes), **Other** (static value). Dynamic assets show a **LIVE** badge and a "value today" preview.

## Screen — Portfolio (sub-page)

Ink hero (current value, today/total P&L chips, invested, total returns); Stocks-vs-MF allocation bar; holdings list with per-row P&L accent, SIP badge, LTP/NAV, live prices (refresh button + "updated" label). Add/Edit holding modals: stock/MF search, quantity + avg buy, optional **monthly SIP** (auto-adds units each month at that month's NAV); re-adding an owned holding **averages** in (weighted avg buy + summed qty).

## Screen — Udhaar (lend/borrow, sub-page)

To collect / To pay summary (per-person netted); one card per person (owes-you green / you-owe rust) with expandable entries; add entry (direction, person with autocomplete, amount, date, note); settle-up (moves to history); settled history.

## Screen — Settings (SETTINGS)

Stats grid (this month / all time / entries / categories); **Money** links (Net worth, Portfolio, Udhaar); **Preferences** — "Month starts on" (1–28, salary day), App lock (PIN), Fingerprint unlock (when a PIN is set and device supports it), Daily reminder (9 PM notification), Replay app tour; **Categories** manager (icon + color, add/edit/delete); **Backup & Data** — Export JSON, Export CSV, Import; **Clear sample data** (only when demo is loaded); **Reset all data** (confirm).

## Onboarding & security

- **Welcome tour** on first launch: 6 full-screen slides, each a real screenshot of the app filled with demo data, then a choice: **"Explore with sample data"** (loads a tagged demo dataset into the real app) or **"Start fresh"**. Replayable from Settings.
- **App lock:** 4-digit PIN + optional **fingerprint** (biometric) unlock; a first-launch prompt offers to set it up.

---

## Data model (IndexedDB, `DB_VERSION` 6)

```js
// expense — `month` is ALWAYS re-derived from date + salary day on load, never trusted
{ id, amount, categoryId, description, note, date:'YYYY-MM-DD', month:'YYYY-MM',
  paymentType:'Cash'|'UPI'|'Card', createdAt }

// category
{ id, name, icon:'🍽️', color:'#hex' }

// budget  (id = 'monthly' or 'cat-<categoryId>')
{ id, amount, categoryId?, month }

// udhaar (lend/borrow)
{ id, person, direction:'lent'|'borrowed', amount, note, date, status:'open'|'settled', createdAt }

// holding (stock / mutual fund)
{ id, kind:'stock'|'mf', symbol?|schemeCode?, name, qty, avgBuy,
  sip?:{ amount, day, lastRun:'YYYY-MM' }, createdAt }

// asset (net-worth item)
{ id, type:'metal'|'fd'|'loan'|'other', name, value?,
  metal?:'gold'|'silver'|'platinum', grams?, purity?,      // metal
  principal?, rate?, startDate?, emi?,                      // fd / loan
  demo?:true }

// networth_snap (one per calendar day) — keyPath 'date'
{ date:'YYYY-MM-DD', total, breakdown:{ investments, bankCash, others, udhaarNet, loans }, demo?:true }

// settings (key-value): monthStartDay, appPin (hash), appBiometric, lockOnboarded,
//   dailyReminder, tourDone, demoLoaded, demoLoadedAt,
//   priceCache, pricesUpdatedAt, metalRates, udhaarStripAt, udhaarNudgeAt
```

`income` and `investments` stores exist from an earlier version and are unused. There is no SMS store (removed).

**14 default categories:** Outside Food, Groceries, Milk, Eggs, Fruits, Vegetables, Travel, Electricity, Rent, Zepto, Shopping, Medical, Xerox, Miscellaneous.

## Key behaviors

- Amounts are ₹, formatted `en-IN`. Typical amounts small and frequent.
- **Financial months:** the month can start on the user's salary day (`monthStartDay`); expense buckets re-derive from date so changing it re-buckets all history safely.
- Budget color rule: <70% green, 70–89% orange, ≥90% red. "Active month" = most recent month with data.
- Udhaar figures **net per person** (same-person debts cancel) but **never net across different people** — Home/Money/ledger all agree.
- **Demo data** is tagged `demo:true`; clearing removes only tagged records and auto-expires 24h after load. Real net-worth snapshots are not recorded while demo is active.
- Market prices refresh **once per calendar day on app-open** (no background jobs in Capacitor); failed fetches keep last-known cached values.

## Tech constraints

- React 18 (JSX, no TypeScript); TailwindCSS 3 (paper-theme tokens in `tailwind.config.js`); Recharts for charts; Capacitor 6 (Android WebView, touch-first, no hover).
- Fonts load from Google Fonts (DM Sans + Instrument Serif); all *data* is offline, and the only runtime network calls are optional market-price/metal lookups (Yahoo Finance + mfapi.in/AMFI) — **stock & metal prices are CORS-blocked in a browser and only work in the installed APK; MF NAV works in the browser too.**
- Single-column mobile layout, `max-w-lg` centered; icons are emoji or inline SVG.
