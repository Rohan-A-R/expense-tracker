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

### Net worth (`src/utils/networth.js`)
`computeNetWorth({holdings, prices, assets, udhaar, metalRates})` is the single source of truth. Assets are dynamic-valued: metals by live rate × grams × fineness, FDs by quarterly compounding, loans by amortization — see `assetValue`. A daily net-worth snapshot is written to `networth_snaps` by an effect in `AppContext` (one row per calendar day, keyed by date); the Money tab's trend chart reads these. Snapshotting is skipped while demo data is loaded so it can't pollute real history.

### Demo mode (`src/utils/demoData.js`)
The welcome tour can load a full sample dataset. Every seeded record is tagged `demo: true`; `db.clearDemoData()` removes **only** tagged records, so the user's own entries are never touched. Demo auto-expires 24h after load (checked at launch via `demoLoadedAt`). Never write a `demo` flag onto real user records.

### Navigation (`src/App.jsx` + `src/components/layout/BottomNav.jsx`)
No router — a `page` string in `App.jsx` switches the rendered page. Bottom nav: HOME · STATS · MONEY · BUDGET · SETTINGS. `SUB_PAGES` (`udhaar`, `portfolio`, `expenses`) render full-screen with a back button and keep their originating tab highlighted via `returnTo`. `NO_FAB` lists pages where the add-expense FAB is hidden.

## Design system (editorial "paper" theme)
- Colors: paper `#F5F0E4`, ink `#1B1710`, rust/brand `#D9481C`, green `#4E9E6A`; on-dark variants green `#84C79B`, rust `#F0844F`.
- Fonts: **DM Sans** (body) + **Instrument Serif** (display) via Google Fonts (`index.html`). Utility classes in `src/index.css`: `.font-serif-i` (italic display), `.font-serif-n`, `.rule`/`.rule-ink`/`.rule-2`/`.rule-dot` (hairline dividers).
- A small `tint(hex, alpha)` helper is duplicated across several files by design (keeps components self-contained) — match the local copy when editing.
- **`DESIGN-CONTEXT.md` is stale**: it documents the original dark/green design that was fully replaced by this editorial theme. Do not treat it as current.

## Verifying changes
There are no automated tests. Verify UI changes by driving the dev server with Playwright and screenshotting (chromium binary at `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`). Native-only behavior (stock/metal prices, fingerprint) can't be exercised in a browser — those paths are guarded by `Capacitor.isNativePlatform()`. The README's banner and device-framed screenshots are generated by Playwright scripts (kept in the session scratchpad) that seed demo data and capture each screen.
