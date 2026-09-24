# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline-first personal-finance Android app (React 18 + Vite 5 + TailwindCSS 3 + Recharts, wrapped in Capacitor 6). Single user, mobile-only portrait layout (`max-width` ~512px / `max-w-lg`). 100% offline — all data in IndexedDB on-device, no backend, no accounts, no analytics. Currency is ₹ (Indian user, UPI-heavy).

## Commands

```bash
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # production web build → dist/
```

There are **no tests and no linter** configured.

### Building the Android APK (exact pipeline — follow in order)

```bash
rm -f public/expense-tracker.apk dist/expense-tracker.apk   # MUST run first (see gotcha below)
npm run build
npx cap sync android                                         # copies dist/ + registers plugins
cd android && ./gradlew assembleDebug
cp android/app/build/outputs/apk/debug/app-debug.apk public/expense-tracker.apk
```

### Releasing an update (in-app update checker)

The app checks `https://api.github.com/repos/Rohan-A-R/expense-tracker/releases/latest` once per day on open (`src/services/updateCheck.js`) and shows a download banner when the release tag is newer than `version` in package.json. To ship an update: bump `version` in package.json → build the APK (pipeline above) → create a GitHub release tagged `v<version>` with `expense-tracker.apk` attached as the asset (via the REST API with the stored git credential; `gh` is not installed). The tag must be `v` + the package.json version or installed apps won't see it.

The finished APK is served to phones from `public/expense-tracker.apk` via the dev server (`http://<lan-ip>:5173/expense-tracker.apk`). It is a **debug-signed** build on purpose: the debug key matches the user's installed app so updates install over it and keep IndexedDB data. Do not add a release signing config — a release-signed APK causes "package conflicts" against the installed debug app. (`build-apk.sh` is an older helper with a different output path and no recursive-APK cleanup; prefer the pipeline above.)

## Architecture

### Single global store: `src/context/AppContext.jsx`
All app state and every mutating action live in one reducer-backed context. Pages call actions from `useApp()`; there is no other state layer. Key design points:

- **`db.js` is the only IndexedDB access.** `AppContext` calls `db.*` then dispatches. Never touch IndexedDB from components.
- **`initPromise` module-level guard** prevents React StrictMode's double-effect from racing the category/seed writes into duplicate-key errors. Keep it.
- **Launch effects** (run once after load): `processSips` catches up any due mutual-fund SIP installments; then price + metal-rate refresh happens **at most once per calendar day** (there is no background job — Capacitor can't run one, so everything refreshes on app-open).

### Financial-month logic (the core data quirk)
The user's month can start on their salary day, not the 1st. An expense's `month` bucket is **always re-derived from its date** via `finMonthOf(date, monthStartDay)` on load (`withMonth`) and on every add/update — never trusted from storage. This is why changing the salary day (`monthStartDay` setting) can safely re-bucket all history. See `src/utils/formatters.js` for `finMonthOf` / `currentFinMonth` / `finPeriodLabel`.

### IndexedDB (`src/services/db.js`, `DB_VERSION` currently 6)
Migrations are **additive only** — add new `createObjectStore` guarded by `!contains(...)`, bump `DB_VERSION`, never rewrite existing stores (users have live data). Active stores: `expenses`, `categories`, `budgets`, `settings`, `udhaar`, `holdings`, `assets`, `networth_snaps`. (`income` and `investments` exist from an earlier version but are unused.)

### Market data (`src/services/marketData.js`)
All HTTP goes through `CapacitorHttp` to bypass CORS. **Only mutual-fund NAV (mfapi.in/AMFI) works in a browser; stock and metal prices (Yahoo Finance) are blocked by CORS and only work in the installed APK.** Fetched prices are cached in the `settings` store (`priceCache`, `metalRates`, `pricesUpdatedAt`) so the UI never blank-flashes and works offline between refreshes. Metal rates come from Yahoo futures (`GC=F`/`SI=F`/`PL=F`) × USD-INR, converted to ₹/gram — international spot, not Indian retail.

Beyond prices, `marketData.js` also serves the holding-detail and Portfolio extras: `fetchStockChart`/`fetchMfSeries` (range charts), `fetchStockFundamentals` (Yahoo `quoteSummary` via a cookie+crumb handshake), `fetchMarketPulse` (NIFTY/SENSEX/USD-INR), `fetchDomainByName` (Clearbit name→domain for logos, rendered via logo.dev — see `src/utils/brands.js`), and `fetchNews` (Google News RSS, India). It also serves stock analysis: `fetchIndustryPeers` (Yahoo **screener**, POST, crumb-authenticated) and the extra `quoteSummary` modules for quarterly results. These calls are memoised by `cachedDaily` (in-memory, once per calendar day). For **browser preview**, a dev-only Vite proxy in `vite.config.js` (`/yfin`, `/yahoo-fundamentals`, `/yahoo-screener`, `/gnews`) routes the CORS-blocked endpoints server-side; native uses `CapacitorHttp` direct. The `quoteSummary` module list lives in two places — `YF_MODULES` in `marketData.js` and the `/yahoo-fundamentals` middleware — keep them in sync.

**Yahoo quirks that have bitten (all handled — don't regress them):**
- Chart series fill market holidays (and the unfinished current bar) with `close: 0` on indices/futures → `fetchStockChart` filters `close > 0`. A trailing 0 otherwise reads as a −100% return.
- On a ranged chart, `meta.chartPreviousClose` is the close *before the whole range* (a year ago on `1Y`), not yesterday. Take the previous bar from the series instead.
- Most NIFTY sectoral indices (`^CNXMETAL`, `^CNXAUTO`, `^CNXFMCG`…) return **one bar at every range** — price only, no history. Only `^NSEBANK`, `^CNXIT`, `^CNXPHARMA` have history. Never rely on a sector index for returns.
- `recommendationsbysymbol` ("similar stocks") is co-viewing noise, not competitors — don't use it for peers.
- `assetProfile.industry` says `"Banks - Regional"`, the screener only matches `"Banks—Regional"` (em dash) and returns 0 otherwise. `fetchIndustryPeers` tries both spellings.
- Firing many requests back-to-back occasionally gets a transient 404 — retry before assuming a code bug. News is display-only (never persisted); a holding's resolved logo domain **is** persisted onto its record (`logoDomain`).

### AI assistant (`src/services/aiClient.js` + `aiContext.js`)
Optional AI features — an **Ask Finances** chat (`src/pages/AskFinances.jsx`, opened from the purple 🪄 button stacked above the + FAB on Home), **stock analysis** (below) and an **AI Recap** card (`src/components/ai/AiRecapCard.jsx`, on the Stats page). Both are gated by the `aiEnabled` setting, which is **on by default** (`getSetting('aiEnabled')` → treat unset/`null` as on; only an explicit `false` disables — coerce with `v !== false`, not `!!v`). Toggle lives in Settings.

**No API key ships in the app.** Requests go to a **Cloudflare Worker** (`cloudflare-worker/finances-ai-worker.js`) that holds the OpenRouter key as a Worker Secret and forwards to the model — `deepseek/deepseek-v4-flash-0731` for everything, with `deepseek/deepseek-v4-flash` as `FALLBACK` on *any* upstream failure (free slugs get withdrawn without notice; the `:free` variant already was, Sept 2026). The app only knows the public Worker URL (in `aiClient.js`). To change the model, edit the Worker's `MODEL` const and **redeploy the Worker by hand** (paste into the Cloudflare dashboard) — no app change, but nothing takes effect until it's redeployed.

The Worker takes `{ prompt, stream?, task? }` where `task` is `chat` (12K prompt / 900 tokens) or `analysis` (60K prompt / 4000 tokens, JSON mode). It sends `reasoning: { enabled: false }`: DeepSeek V4 Flash is a reasoning model whose thinking tokens share the `max_tokens` budget — left on, it can spend the whole budget thinking and return an **empty 200** (looks like a hang: ~53s per attempt, then retries). An empty completion is returned as a 502 with `finish_reason`, never as `{text:""}`. The Worker sends `Access-Control-Allow-Origin: *`, so a direct `CapacitorHttp.post` (buffered) and `fetch` (streaming) both work on native and in browser preview — no Vite proxy needed.

**The model never does math.** `aiContext.js` `buildSnapshot(app)` precomputes every figure in JS — reusing `generateReport` (`report.js`) and `computeNetWorth` (`networth.js`) — and hands the model finished numbers (current + up to 12 months of spending, per-holding P&L, per-asset detail, udhaar per person + entries, last 30 transactions). A `FEATURE_CHEATSHEET` keeps how-to answers accurate. `aiClient.js` exposes `aiComplete` (buffered, 2× auto-retry — used by the recap) and `aiStream` (SSE token streaming with 1 retry, then falls back to `aiComplete`). Retry matters because models intermittently return empty or 429. `aiComplete(prompt, { task, retries })` passes `task` through (analysis gets a 90s read timeout and 1 retry).

**Privacy:** a data snapshot (aggregates + recent transactions) leaves the device **only** when the user taps Ask/Recap; stock analysis sends public market data plus the user's position in that stock (qty, avg cost, portfolio weight). Everything else stays offline. The single `aiEnabled` toggle in Settings gates all three.

### Stock analysis (`src/services/stockAnalysis.js` + `sectorPlaybook.js` + `utils/technicals.js`)
On-demand research report on a stock holding — "🔬 Analyse" on `HoldingDetail.jsx` (stocks only, `aiEnabled`), rendered by `components/portfolio/StockAnalysisCard.jsx`. Pipeline in `analyseStock(symbol, name, onProgress, position)`:

1. **Identify** — 1Y OHLCV chart + fundamentals (gives `sector`/`industry`/`marketCapRaw`).
2. **Route** — `playbookFor({sector, industry})` keyword-matches one of 19 industry playbooks → **drivers** (commodity/index/FX tickers, e.g. `TIO=F`, `HRC=F` for steel) and **news topics**. Drivers stay curated (every ticker verified live) — a wrong commodity symbol fails silently.
3. **Peers** — never hardcoded. `fetchIndustryPeers(industry)` lists every Indian company in the industry; `pickPeers` takes the **nearest by market cap** (log-ratio distance) plus the leader as labelled context. Size-matching is the point: Ujjivan SFB and HDFC Bank share `Banks—Regional` at ~89× different size.
4. **Gather** in parallel (~20 requests, each `settle`d so one failure degrades rather than breaks): peer prices + P/E, drivers, NIFTY, news per topic.
5. **Compute** in JS — `computeTechnicals` (RSI, MACD + crossover age, DMAs, Bollinger, ATR, swing-pivot levels, returns, drawdown, volume), relative strength vs a **synthetic equal-weight peer basket** (sector indices lack history), `earningsSummary` (QoQ growth, margins, EPS beat/miss), `positionSummary`, `freshNews` (sorted, >120 days dropped, age attached).
6. **Format** — `formatContext` → labelled plain text; anything missing is written as "not available" so the model sees the gap.
7. **Model** — `analysisPrompt` = strict rules (use only given data, never calculate, compare to size-matched peers, weight news by age, position levels are references not instructions, not advice) + JSON schema. `parseReport` tolerates fences/prose and clamps score/verdict.

Same rule as the chat: **figures on screen come from `context`, never from the model's text.** Reports are cached per symbol in memory for the session.

`scripts/` holds dev-only Playwright probes: `probe-analysis.mjs <SYMBOL> [name]` prints the full assembled context (no AI), `probe-full.mjs <SYMBOL>` also calls the Worker and prints the raw reply, `shot-analysis.mjs <out.png>` screenshots the rendered report with a stubbed model reply. Run them from the repo root with `npm run dev` up (playwright must resolve from the project's `node_modules`).

### Net worth (`src/utils/networth.js`)
`computeNetWorth({holdings, prices, assets, udhaar, metalRates})` is the single source of truth. Assets are dynamic-valued: metals by live rate × grams × fineness, FDs by quarterly compounding, loans by amortization — see `assetValue`. A daily net-worth snapshot is written to `networth_snaps` by an effect in `AppContext` (one row per calendar day, keyed by date); the Money tab's trend chart reads these. Snapshotting is skipped while demo data is loaded so it can't pollute real history.

### Demo mode (`src/utils/demoData.js`)
The welcome tour can load a full sample dataset. Every seeded record is tagged `demo: true`; `db.clearDemoData()` removes **only** tagged records, so the user's own entries are never touched. Demo auto-expires 24h after load (checked at launch via `demoLoadedAt`). Never write a `demo` flag onto real user records.

### Navigation (`src/App.jsx` + `src/components/layout/BottomNav.jsx`)
No router — a `page` string in `App.jsx` switches the rendered page. Bottom nav: HOME · STATS · MONEY · BUDGET · SETTINGS. `SUB_PAGES` (`udhaar`, `portfolio`, `expenses`, `ask`) render full-screen with a back button and keep their originating tab highlighted via `returnTo`. `NO_FAB` lists pages where the add-expense FAB is hidden.

## Design system (editorial "paper" theme)
- Colors: paper `#F5F0E4`, ink `#1B1710`, rust/brand `#D9481C`, green `#4E9E6A`; on-dark variants green `#84C79B`, rust `#F0844F`.
- Fonts: **DM Sans** (body) + **Instrument Serif** (display) via Google Fonts (`index.html`). Utility classes in `src/index.css`: `.font-serif-i` (italic display), `.font-serif-n`, `.rule`/`.rule-ink`/`.rule-2`/`.rule-dot` (hairline dividers).
- A small `tint(hex, alpha)` helper is duplicated across several files by design (keeps components self-contained) — match the local copy when editing.
- **`DESIGN-CONTEXT.md` is stale**: it documents the original dark/green design that was fully replaced by this editorial theme. Do not treat it as current.

## Verifying changes
There are no automated tests. Verify UI changes by driving the dev server with Playwright and screenshotting (chromium binary at `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`). Native-only behavior (stock/metal prices, fingerprint) can't be exercised in a browser — those paths are guarded by `Capacitor.isNativePlatform()`. The README's banner and device-framed screenshots are generated by Playwright scripts (kept in the session scratchpad) that seed demo data and capture each screen.
