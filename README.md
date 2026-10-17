<div align="center">

<img src="docs/banner.png" alt="Finances — your money, fully offline" width="100%"/>

<br/><br/>

An offline-first personal finance app: track spending, budgets, investments, gold &amp; loans, lending, and your whole net worth — with **zero accounts, zero cloud, zero tracking.** Everything lives in your phone's local storage.

<br/>

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-6-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)
![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)

![Offline](https://img.shields.io/badge/100%25-Offline-4E9E6A?style=flat-square)
![No Backend](https://img.shields.io/badge/Backend-None-D9481C?style=flat-square)
![Storage](https://img.shields.io/badge/Storage-IndexedDB-C9972E?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-1B1710?style=flat-square)

</div>

---

## 📱 Screens

<div align="center">
<table>
  <tr>
    <td align="center"><img src="docs/frames/home.png?v=4" width="215"/><br/><b>Home</b><br/><sub>Budget, journal & portfolio</sub></td>
    <td align="center"><img src="docs/frames/money.png?v=2" width="215"/><br/><b>Net worth</b><br/><sub>Everything you own & owe</sub></td>
    <td align="center"><img src="docs/frames/portfolio.png?v=2" width="215"/><br/><b>Portfolio</b><br/><sub>Live stocks & mutual funds</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/frames/analysis.png?v=3" width="215"/><br/><b>Stock analysis 🔬</b><br/><sub>A research note on demand</sub></td>
    <td align="center"><img src="docs/frames/detail.png?v=2" width="215"/><br/><b>Holding detail</b><br/><sub>Chart, levels, your position</sub></td>
    <td align="center"><img src="docs/frames/ask.png?v=2" width="215"/><br/><b>Ask Finances 🪄</b><br/><sub>AI: your money & the app</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/frames/breakdown.png?v=3" width="215"/><br/><b>Breakdown</b><br/><sub>Where money goes</sub></td>
    <td align="center"><img src="docs/frames/trends.png?v=2" width="215"/><br/><b>Trends</b><br/><sub>Category, month over month</sub></td>
    <td align="center"><img src="docs/frames/udhaar.png?v=2" width="215"/><br/><b>Udhaar</b><br/><sub>Who owes you & you owe</sub></td>
  </tr>
</table>
</div>

---

## 🔬 How stock analysis works

One tap builds an evidence-based research note. Financial metrics, scores and the assessment are **computed deterministically by code**; the AI is called once, at the end, to explain them — and **every figure it writes is validated against the recorded evidence**, with failing statements removed. A note costs well under ₹1.

```mermaid
flowchart TD
    A([📱 Tap “Analyse this stock”]) --> B

    subgraph PHONE["On the phone — free, no AI"]
        B["<b>1 · Collect</b><br/>4 years of annual statements · quarterly results<br/>1Y daily + 5Y weekly prices · fundamentals · broker consensus<br/><i>Yahoo Finance</i>"]
        B --> C["<b>2 · Route</b><br/>19 sector playbooks → drivers & news topics<br/>+ a financial model: bank · lender · insurer · cyclical · IT · utility · real estate · general"]
        C --> D["<b>3 · Peers</b><br/>same NSE industry (NIFTY 500 list) → nearest by size<br/>→ ranked by margin, growth, leverage & ROE similarity<br/>median & interquartile range · “too few peers” flagged"]
        D --> E["<b>4 · Fact book</b><br/>every input gets an id, period, source, fetch time & status<br/>missing ≠ zero — gaps recorded as “not available”"]
        E --> F["<b>5 · Engines</b><br/>quality: CAGR, margins, ROCE/ROE, cash conversion, FCF<br/>strength: leverage, interest cover · banks: ROA, NII, capital proxy<br/>valuation: vs peers, vs own history, range with assumptions<br/>market: long/medium/short horizons, liquidity, split checks<br/>risk: volatility, drawdown, dilution, misses · governance = not assessed"]
        F --> G["<b>6 · Scorecard</b><br/>5 pillar scores (0–10) · sector weights · coverage per pillar<br/>Positive · Neutral · Negative · <b>Insufficient evidence</b>"]
    end

    G --> H

    subgraph CLOUD["Cloud — the only paid step"]
        H["Cloudflare Worker<br/><i>holds the API key</i>"] --> I["OpenRouter → DeepSeek V4 Flash<br/>writes claims that cite fact ids<br/>fact vs interpretation · unknowns"]
    end

    I --> J["<b>7 · Validate</b><br/>unknown ids stripped · uncited facts removed<br/>numbers not in the evidence removed · counts shown"]
    J --> K["<b>8 · Save & evaluate</b><br/>note kept 7 days · every call logged with method version<br/>1M / 3M / 6M / 12M outcome vs NIFTY once each window has passed"]
    K --> L([📄 Research note: thesis · scorecard · quality · risk · valuation<br/>market · catalysts · what would change the view<br/>data quality · your position · evidence list])
```

| Step | Where | Code |
|---|---|---|
| Prices, statements, fundamentals, news | Yahoo Finance · NSE · Google News | [`marketData.js`](src/services/marketData.js) |
| Fact book & provenance | on-device | [`research/facts.js`](src/services/research/facts.js) |
| Quality & strength by financial model | on-device | [`research/fundamentals.js`](src/services/research/fundamentals.js) |
| Peers & valuation | on-device | [`research/valuation.js`](src/services/research/valuation.js) |
| Market behaviour & risk | on-device | [`research/market.js`](src/services/research/market.js) |
| Scorecard & assessment | on-device | [`research/scorecard.js`](src/services/research/scorecard.js) |
| Claim validation | on-device | [`research/validate.js`](src/services/research/validate.js) |
| Pipeline & prompt | on-device | [`stockAnalysis.js`](src/services/stockAnalysis.js) |
| AI proxy | Cloudflare Worker | [`finances-ai-worker.js`](cloudflare-worker/finances-ai-worker.js) |
| Notes, track record & outcomes | IndexedDB | [`analysisStore.js`](src/services/analysisStore.js) |

**Limits, stated plainly:** governance (promoter pledging, audit opinions, related-party deals, litigation) and bank asset quality (NPAs, capital adequacy) need exchange filings that free data doesn't provide — they're shown as *not assessed*, never as clean. Outcomes are measured only going forward: there's no point-in-time fundamentals history to backtest without look-ahead bias. Scoring thresholds are starting hypotheses, versioned so they can be recalibrated against outcomes.

---

## ✨ Features

### 🧾 Track
- One-tap expense logging with categories, notes, payment type
- **Salary-day months** — your month can start on payday, not the 1st
- Monthly & per-category **budgets** with live progress
- Search, filter and sort your full spend history

### 📊 Understand
- **Breakdown** — category donut for any month
- **Trends** — per-category spend across the last 5 months
- **Monthly** — 6-month bar chart with average line
- **Report** — safe-to-spend a day, a *this-month-vs-last* race chart, spending-calendar heatmap, category-budget alerts, and the little repeat purchases that add up

### 📈 Grow
- **Portfolio** — add stocks & mutual funds, **live prices** (Yahoo Finance + AMFI NAV), weighted-average buy price, allocation split
- **Holding detail** — live chart (1M · 6M · 1Y · 5Y · MAX) with automatic support & resistance per timeframe, your position, day & 52-week range bars, valuation, financials, and the **analyst view**: consensus, buy/hold/sell split and average target with upside
- **Recurring SIPs** that auto-add units each month at that month's NAV
- **Net worth hub** — one number for everything you own and owe, with a **stock-app-style trend chart** (1M · 6M · 1Y · 5Y · ALL)
- **Live-valued assets**: gold / silver / platinum by weight, **auto-compounding FDs**, **amortizing loans**

### 🔬 AI stock analysis
One tap on any stock holding produces an **evidence-based research note** — an assessment (Positive / Neutral / Negative, or *Insufficient evidence*), a score built from five pillars, and plain-English sections that cite their evidence:
- **Fundamentals over four years** — revenue and profit growth, margins and their trend, ROCE/ROE, cash conversion, free cash flow, leverage and interest cover; **banks** judged on ROA, ROE, net interest income and capital instead
- **Valuation** — against size- and business-matched peers (median and range), against the company's own history, and a valuation range with its assumptions shown — never an invented target
- **Market behaviour by horizon** — long, medium and short term kept apart; liquidity, relative strength vs NIFTY and the sector, split/bonus checks
- **Sector-aware** — 19 industry playbooks pick the drivers that matter (iron ore & steel futures for steel, NIFTY Bank & RBI for banks, USD-INR for IT)
- **Every figure has provenance** — source, period and when it was fetched; anything missing is shown as missing, governance as *not assessed*
- **AI explains, code decides** — scores and the assessment are rule-based; the AI's statements must cite fact ids and any figure not in the evidence is removed, with counts shown
- **Track record** — every call is logged with its method version and later compared with NIFTY at 1, 3, 6 and 12 months
- Research and education, not investment advice

### 🪄 Ask Finances (AI)
- **Ask anything** — a chat assistant that answers questions about your money (*"Am I over budget?"*, *"How much on food this month?"*) or how the app works (*"How do I add a SIP?"*)
- **AI Recap** — a one-tap friendly summary of your month on the Stats page
- **Numbers stay honest** — every figure is computed on-device and handed to the model as a finished total, so it phrases and explains but never does the math
- **No API key in the app** — requests go through a Cloudflare Worker proxy; the model provider key lives server-side
- **Opt-in, on by default** — a data summary leaves the device *only* when you tap Ask or Recap; toggle it off anytime in Settings

### 📰 As it happens (daily news)
- **Today's news on Home** — the top story from India, World, Markets and Tech on a live timeline, with photos
- **Full front page** — every story from the last 24 hours, filterable by section, from NDTV, The Times of India, The Hindu, BBC, The Economic Times and Gadgets 360
- **Light on data** — refreshed at most every 30 minutes, right-sized photos, last batch kept for offline; no photos are stored and news never enters your data or backups

### 🤝 Lend & borrow
- **Udhaar ledger** — track who owes you and who you owe, netted per person, with settle-up and history

### 🔒 Secure & portable
- **App lock** with 4-digit PIN + optional **fingerprint unlock**
- **JSON backup & restore**, CSV export
- **Welcome tour** with a *"try with sample data"* demo mode that auto-clears after a day

### 🛡️ Private by design
- **Offline-first** — no accounts, no servers, no analytics
- All data in **IndexedDB** on the device; network calls are limited to market prices & news and — only when you use them — the AI features

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Styling | TailwindCSS 3 (editorial "paper" theme) |
| Charts | Recharts 2 |
| Storage | IndexedDB via [`idb`](https://github.com/jakearchibald/idb) |
| Mobile | Capacitor 6 (Android) |
| Market data | Yahoo Finance (stocks/metals) · mfapi.in / AMFI (MF NAV) |
| AI | DeepSeek V4 Flash via OpenRouter, behind a Cloudflare Worker proxy (no key in the app) |
| News | Google News RSS (India) |
| Biometrics | `@aparajita/capacitor-biometric-auth` |

---

## 🚀 Quick Start (Web / Development)

```bash
npm install      # install dependencies
npm run dev      # start dev server → http://localhost:5173
```

> Stock & metal prices and fingerprint unlock are native-only (blocked by CORS / no hardware in a browser). Everything else — including mutual-fund NAV — works in the browser.

## 📦 Build the Android APK

**Prerequisites:** Node 18+, JDK 17+, Android SDK (API 34).

```bash
npm run build                 # 1. build the web bundle
npx cap sync android          # 2. copy web assets + register plugins
cd android && ./gradlew assembleDebug   # 3. build the APK
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

App ID: `com.personal.expensetracker` · Display name: **Finances**

---

## 🗄️ Data Model

Everything is stored locally in IndexedDB — no data ever leaves the device.

| Store | Purpose |
|-------|---------|
| `expenses` | Every expense (bucketed into financial months) |
| `categories` | Category definitions (icon + colour) |
| `budgets` | Monthly & per-category budgets |
| `udhaar` | Lend / borrow entries per person |
| `holdings` | Stocks & mutual funds (+ SIP config) |
| `assets` | Net-worth items: metals, FDs, loans, other |
| `networth_snaps` | One daily net-worth snapshot → the trend chart |
| `settings` | Preferences, cached prices, PIN hash, flags |

Financial-month logic re-buckets every expense from its date, so changing your salary day is always safe.

---

## 📁 Project Structure

```
src/
├── components/
│   ├── ai/             # AI recap card
│   ├── expenses/       # expense card + form
│   ├── insights/       # Report tab
│   ├── layout/         # bottom nav
│   ├── onboarding/     # welcome tour
│   ├── portfolio/      # holding detail, news, AI stock-analysis card
│   ├── security/       # PIN + biometric lock
│   └── ui/             # modal, etc.
├── context/AppContext.jsx   # global state + all actions
├── pages/              # Dashboard, Expenses, Analytics, Budget, Settings,
│                       # Portfolio, NetWorth, Udhaar, AskFinances
├── services/           # db (IndexedDB), marketData, aiClient, aiContext, stockAnalysis,
│                       # sectorPlaybook, export, notifications, biometrics
└── utils/              # formatters, report, networth, technicals, demoData, sampleData
cloudflare-worker/      # AI proxy — holds the OpenRouter key server-side
scripts/                # dev-only Playwright probes for the stock-analysis pipeline
```

---

## 🔐 Privacy

No sign-up. No backend for your data. No telemetry. Your expenses, budgets, balances and PIN live in IndexedDB on your phone.

The app makes network requests in just a few cases: to fetch live investment/metal prices and market news (only when you hold something priced), today's headlines for the Home news brief, and — if you use the AI features — to the AI assistant:
- **Ask Finances / AI Recap** send a summary of your data (aggregates + recent transactions).
- **Stock analysis** sends the computed evidence for that stock (public market data, financial statements, headlines) plus your position in it (quantity, average cost, share of portfolio) — nothing about your spending.

All AI features are clearly labelled in Settings and can be turned off; nothing is sent unless you tap Ask, Recap or Analyse.

---

## 📄 License

[MIT](LICENSE) — free to use, modify and share.

<div align="center"><sub>Built with Claude Code · 100% on-device</sub></div>
