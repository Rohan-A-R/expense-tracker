# Expense Tracker — Full App Context for UI Redesign

This document describes everything the app currently has — screens, layouts, data models, flows — so a new UI can be designed without losing any functionality. **All existing features must remain; only the visual design should change.**

## What the app is

A **personal, offline-first expense tracker Android app** for an Indian user (currency ₹, UPI-heavy usage). Built with React 18 + Vite + TailwindCSS 3 + Recharts, wrapped in Capacitor 6 for Android. 100% offline — all data in IndexedDB on-device, no backend, no accounts. Single user. Mobile-only layout (max-width ~512px, portrait).

## Current design language (to be replaced)

- Dark theme by default (near-black `#0d1117`-ish surfaces: `surface-900/800/700`), optional light mode toggle
- Brand/accent color: green `#00C896` (used for FAB, active states, gradients `#00C896 → #00a87e`)
- Rounded cards (`rounded-2xl`/`rounded-3xl`), thin `white/[0.06]` borders, emoji icons everywhere
- Bottom tab bar (5 tabs) + floating action button (FAB) bottom-right for "Add Expense"
- Bottom-sheet style modals for all forms

## Navigation structure

**Bottom nav (5 tabs):** Home (Dashboard) · Expenses · Analytics · Budget · More (Settings)
**Extra screen (not in tab bar):** SMS Transactions review — reached from a Dashboard banner or Settings; has its own back button.
**Global FAB:** "+" button (visible on all tabs except Settings and SMS review) opens the Add Expense bottom-sheet.

---

## Screen 1 — Dashboard (Home)

- Header: active month name + "My Finances" title + ₹ logo chip
- **SMS review banner** (conditional): "N SMS transactions waiting for review" → opens SMS review screen
- **Big balance card** (gradient, decorative rings): "Total Spent" for the month, huge ₹ amount, and 3 stat chips inside: This Week / Daily Avg / number of Expenses
- **Budget progress** (if monthly budget set): progress bar with % used; color shifts green → orange (≥70%) → red (≥90%); remaining amount
- **Top category** of the month (icon + name + amount)
- **Recent transactions** list (last 10): category icon, description, date, payment type, amount; tap to edit

## Screen 2 — Expenses

- Search input (searches description)
- Filter chips: by category, by month; sort toggle (by date / by amount)
- Grouped list of all expenses (expense card = category icon w/ colored background, description, category name, date, payment-type badge, ₹ amount)
- Tap card → edit in the Expense form modal; delete available
- Empty state when no results

## Screen 3 — Analytics

Four sub-tabs (pill switcher): **Breakdown · Monthly · Daily · Insights**
- Month selector (only months that have data)
- **Breakdown:** donut/pie chart of category spend for the month + ranked category list with % of total, amounts, colored per category
- **Monthly:** bar chart of last 6 months' totals
- **Daily:** area/line chart of daily spend within the selected month
- **Insights:** auto-generated text cards (e.g. "Your top category is X", overspend warnings, comparisons vs last month, saving suggestions) — generated locally from data, each with icon + message

## Screen 4 — Budget

- Header with active month
- **Monthly budget card:** total budget vs spent, progress bar (green/orange/red thresholds), remaining ₹, edit budget inline
- **Per-category budgets:** list of categories with spend this month; each can have its own budget with its own progress bar; tap to set/edit

## Screen 5 — Settings ("More")

- **Stats grid (2×2):** This month total · All time total · Total entries · Categories count
- **Appearance:** Dark mode toggle switch
- **Automation section:**
  - "SMS Transactions" row → opens SMS review screen (shows pending count)
  - "Daily Reminder" toggle → schedules a 9 PM daily notification ("Did you log today's expenses?")
- **Categories manager:** list of all categories with edit/delete; "+ Add" opens a modal (name input, emoji icon picker grid of ~26 emojis, color picker of 14 colors, live preview)
- **Backup & Data:** Export JSON backup · Export CSV · Import backup (file picker) · Load sample data
- **Danger zone:** Reset all data (confirm modal)

## Screen 6 — SMS Transactions Review (new feature, important!)

Purpose: the app reads Android SMS inbox, auto-detects **bank/UPI debit messages** (auto-scans today's messages on app open; manual "Scan SMS" button too). Detected transactions are **pending** until the user maps them — nothing is auto-added.

- Header: back button, title, pending count, "↻ Scan SMS" button
- List of pending transaction cards: merchant name (e.g. `zomato@paytm`, "AMAZON"), date + bank code, amount (e.g. −₹250), truncated raw SMS text, two actions: **"Add as Expense"** (primary) and **"Dismiss"**
- **Mapping modal** ("Map Transaction"): shows detected amount/merchant/date, a "This belongs to" category grid picker, editable note, payment type selector (UPI/Card/Cash/Netbanking), Save button
- Empty state ("All caught up") and web fallback state ("Android only")

## Modals / forms

- **Add/Edit Expense (bottom sheet):** big amount input with ₹ prefix, category grid picker (icon + name), description input, date picker, payment type picker (Cash 💵 / UPI 📲 / Card 💳), save button; delete when editing
- **Category add/edit:** name, emoji picker, color swatches, preview
- **Confirm modal:** used for destructive actions (reset, delete)

---

## Data model (IndexedDB, keep as-is)

```js
// expense
{ id, amount: Number, categoryId: Number, description: String,
  date: 'YYYY-MM-DD', month: 'YYYY-MM', paymentType: 'Cash'|'UPI'|'Card', createdAt }

// category
{ id, name: String, icon: '🍽️' (emoji), color: '#hex' }

// budget  (id = 'monthly' or 'cat-<categoryId>')
{ id: String, amount: Number }

// settings (key-value): theme, dailyReminder, smsLastSync

// smsTransaction (pending SMS-detected debit)
{ id, smsId, amount, merchant, ref, bank, body (raw SMS), smsDate (epoch ms),
  status: 'pending'|'mapped'|'dismissed', expenseId? }
```

**14 default categories:** Outside Food 🍽️, Groceries 🛒, Milk 🥛, Eggs 🥚, Fruits 🍎, Vegetables 🥦, Travel 🚌, Electricity ⚡, Rent 🏠, Zepto 🛍️, Shopping 🛍️, Medical 💊, Xerox 📄, Miscellaneous 📦 — each with its own color. Users can add/edit/delete categories.

## Key behaviors to preserve

- Amounts are Indian Rupees, formatted `en-IN` (₹1,200.50)
- Typical amounts are small and frequent (₹30 milk, ₹90 dosa, ₹45 UPI payments)
- Budget progress color rule: <70% green, 70–89% orange, ≥90% red
- "Active month" = most recent month that has data
- Dark mode is the primary theme; light mode must also work
- Everything must feel fast and native on a phone (touch targets, `active:scale` feedback, safe-area padding for the bottom nav)

## Tech constraints for the redesign

- React 18 (JSX, no TypeScript), TailwindCSS 3 (custom `surface-900/800/700/600` and `brand` colors defined in tailwind.config.js — palette can be redefined)
- Recharts for all charts
- No external images/fonts requiring network (offline app) — system fonts or bundled fonts only; icons are emojis or inline SVG
- Single-column mobile layout, max-w-lg centered
- Runs inside an Android WebView (Capacitor) — no hover states matter, touch-first

## What the user wants from the new design

A **nicer, more modern, premium-feeling UI** — the current one feels basic. Keep all screens, features, flows, and data exactly as described above; redesign the visual layer (colors, typography, spacing, cards, charts styling, nav, empty states, micro-interactions).
