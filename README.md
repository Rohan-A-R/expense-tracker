# Expense Tracker — Offline-First Android App

A fully private, offline-first personal expense tracking app built with React + Vite + TailwindCSS + Capacitor. All data is stored locally on your device using IndexedDB — no backend, no cloud, no accounts required.

## Features

- **Dashboard**: Monthly total, weekly spending, daily average, budget remaining, recent transactions
- **Expense Management**: Add, edit, delete expenses with category, date, note, payment type
- **Analytics**: Pie charts, monthly bar chart, daily trend area chart, percentage breakdown
- **Smart Insights**: Auto-generated spending insights and saving suggestions
- **Budget**: Set monthly and per-category budgets with visual progress bars
- **Search & Filter**: Filter by category, month, search notes, sort by date/amount
- **Categories**: 14 default categories + create/edit/delete your own with custom icon & color
- **Backup & Export**: Export to JSON (full backup) or CSV, import backup files
- **Dark Mode**: Full dark mode support with toggle
- **Offline First**: 100% offline, IndexedDB storage, no internet needed
- **Sample Data**: Ships with May 2025 real expense data pre-loaded

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Styling | TailwindCSS 3 |
| Charts | Recharts 2 |
| Storage | IndexedDB (via `idb` library) |
| Mobile | Capacitor 6 |
| Build | ESBuild (via Vite) |

---

## Quick Start (Browser / Development)

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open in browser
# http://localhost:5173
```

---

## Android APK Build (Step by Step)

### Prerequisites

- **Node.js** 18+
- **Java Development Kit (JDK) 17+**
- **Android Studio** (with Android SDK)
- **Android SDK** with API level 34

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Build the web app

```bash
npm run build
```

### Step 3 — Initialize Capacitor (first time only)

```bash
npx cap init "Expense Tracker" "com.personal.expensetracker" --web-dir dist
```

### Step 4 — Add Android platform (first time only)

```bash
npx cap add android
```

### Step 5 — Sync web build to Android

```bash
npx cap sync android
```

### Step 6 — Open in Android Studio

```bash
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to complete
2. Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. The APK will be in `android/app/build/outputs/apk/debug/app-debug.apk`

### Subsequent builds (after code changes)

```bash
npm run build && npx cap sync android
# Then build APK from Android Studio
```

---

## Project Structure

```
expense-tracker/
├── src/
│   ├── components/
│   │   ├── analytics/          # Chart components (Pie, Bar, Line)
│   │   ├── dashboard/          # Stat cards, budget progress, recent transactions
│   │   ├── expenses/           # Expense card, expense form
│   │   ├── insights/           # Insight card
│   │   ├── layout/             # Bottom nav, header
│   │   └── ui/                 # Button, Card, Modal, Input, Badge
│   ├── context/
│   │   └── AppContext.jsx      # Global state + all actions
│   ├── pages/
│   │   ├── Dashboard.jsx       # Home screen
│   │   ├── Expenses.jsx        # Expense list with search/filter
│   │   ├── Analytics.jsx       # Charts + insights
│   │   ├── Budget.jsx          # Budget management
│   │   └── Settings.jsx        # Categories, theme, backup/export
│   ├── services/
│   │   ├── db.js               # IndexedDB service (idb)
│   │   └── export.js           # JSON/CSV export, import parser
│   └── utils/
│       ├── formatters.js       # Currency, date, month formatters
│       ├── insights.js         # Smart insight generation
│       └── sampleData.js       # Default categories + May 2025 sample expenses
├── capacitor.config.ts
├── tailwind.config.js
├── vite.config.js
└── package.json
```

---

## Storage Architecture

All data is stored in **IndexedDB** using the `idb` library with 4 object stores:

| Store | Key | Purpose |
|-------|-----|---------|
| `expenses` | autoIncrement | All expense records |
| `categories` | autoIncrement | Category definitions |
| `budgets` | manual (`monthly`, `cat-N`) | Monthly and per-category budgets |
| `settings` | string key | App preferences (theme, etc.) |

No data ever leaves the device. No network requests are made after initial font load.

---

## Default Categories

Outside Food, Groceries, Milk, Eggs, Fruits, Vegetables, Travel, Electricity, Rent, Zepto, Shopping, Medical, Xerox, Miscellaneous

---

## Performance Notes

- Code-split chunks: vendor (React), charts (Recharts), app code
- Minimal re-renders using `useMemo` and `useCallback`
- No polling or background tasks
- IndexedDB async operations — no blocking
- Touch events handled natively — no gesture libraries

---

## Android Configuration Notes

The `capacitor.config.ts` sets:
- `androidScheme: 'https'` — enables secure context (required for IndexedDB on Android)
- `backgroundColor: '#1a1a2e'` — prevents white flash on app load
- Status bar dark style
