# Vault: Personal Finance & Budgeting

Vault is a personal finance app with a premium dark interface. It covers transactions, budgets, income, bills, savings goals, debts, net worth, a financial calendar, analytics and a safe-to-spend calculator. Everything is stored in a real database, so your data survives a page refresh or a server restart.

## Quick start

Requires **Node.js 22.13+**. Vault uses Node's built-in `node:sqlite`, so there is no native build step.

```bash
npm install
npm run dev          # API on :3001 + Vite dev server on http://localhost:5173
```

Production:

```bash
npm run build
npm start            # serves the API and the built app on http://localhost:3001
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests for finance math, plus API integration tests (in-memory SQLite) |
| `npm run typecheck` | Strict TypeScript check |

Environment variables:

- `PORT`: server port (default `3001`).
- `VAULT_DB`: database file path (default `data/vault.db`).
- `VAULT_NO_DEMO=1`: start empty instead of loading sample data.

## Deploying online (Railway)

The repo includes `railway.json`: it builds with `npm run build`, starts with `npm start`, and health-checks `/api/health`.

1. Create a Railway project from this GitHub repo and select your deployment branch.
2. Add a **Volume** to the service, mounted at `/data`.
3. Set these variables:
   - `VAULT_PASSWORD`: required. It gates the whole app behind a sign-in.
   - `VAULT_DB=/data/vault.db`: keeps the database on the volume so it survives redeploys.
   - `VAULT_NO_DEMO=1`: optional. Start empty instead of with sample data.
   - `VAULT_SESSION_SECRET`: optional. A long random string that signs sign-in sessions; changing it signs out every device.
4. Under **Networking**, generate a public domain and open it on your phone.

Sessions last 30 days and use an HttpOnly cookie. After 5 wrong passwords, sign-in is blocked for 5 minutes. When `VAULT_PASSWORD` is not set (local development), no sign-in is required.

## Install on your phone

Vault is an installable web app (PWA). Once it's online, open its address and add it to your home screen. It then launches full-screen with its own icon and a bottom tab bar.

- **iPhone:** in **Safari**, tap Share → **Add to Home Screen**. On iOS, only Safari can install.
- **Android:** in Chrome, tap ⋮ → **Install app** (or **Add to Home screen**).

The service worker caches only the app's code, so it opens instantly. Financial data is never cached: it always comes live from your server.

## Demo data

On first run Vault loads a year of realistic sample data. Every sample record is stored with `is_demo = 1` and shown with a **DEMO** tag. A banner on every page and a button in **Preferences** remove it in one step. Anything you entered yourself is kept, along with your categories and budgets. You can reload the demo later from Preferences.

## Architecture

```
server/            Express API + SQLite
  db.js            schema (money stored as INTEGER cents), transaction helper
  app.js           REST routes, validation, balance bookkeeping, import/export
  validate.js      input validation
  seed.js          default categories/settings + deterministic demo data
  api.test.js      integration tests
src/
  lib/finance.ts   all financial calculations (pure, unit-tested)
  lib/dates.ts     timezone-safe date math + recurrence engine
  lib/csv.ts       CSV parser + column auto-detection
  store/           DataContext: loads /api/state, re-syncs after every change
  components/      design system (cards, modals, forms, charts, layout)
  pages/           Dashboard, Analytics, Transactions, Budgets, Income, Bills,
                   Goals, Debts, Calendar, Net Worth, Profile, Preferences
```

**How data stays consistent**

- Every change runs inside a single SQLite transaction.
- After each change the client reloads the full state, so every page always shows the same numbers.

**Money and balances**

- All amounts are integer cents end to end, so there is no floating-point drift.
- Account balances update automatically for linked transactions:
  - editing a transaction reverses the old amount and applies the new one;
  - deleting a transaction reverses it.
- Bill payments, debt payments and goal contributions can optionally create a linked transaction or move money between accounts. Undoing one reverses that too.
- Bills are **never** marked paid automatically.

**Duplicates**

- CSV imports are de-duplicated with a content hash. That hash also includes the row's position among identical rows, so two real $4.50 coffees on the same day both import.
- Imported rows that match a transaction you already entered by hand are skipped.
- Re-importing the same file adds nothing.

**Net worth history**

- One snapshot per month. The current month's snapshot updates whenever balances change.

**Backup and portability**

- Full JSON backup and restore.
- Transaction CSV export. Cells that start with `=`, `+`, `-` or `@` are escaped so they can't run as spreadsheet formulas.

### Key calculations

| Metric | Formula |
|---|---|
| Net worth | Assets − (liability accounts + tracked debts) |
| Savings rate | (income − expenses) ÷ income |
| Dashboard month-over-month | This month to date vs the **same span** of last month, for a fair comparison mid-month |
| Safe to spend (through month end) | Available cash (accounts marked "available") − unpaid & overdue bills − remaining debt minimums − unused budget per category − monthly goal contributions not yet made. Bills are subtracted from their category's remaining budget, so nothing is counted twice. Every line is shown under "See calculation". |
| Goal ETA | Remaining ÷ planned monthly contribution (or the 3-month average when no plan is set) |
| Required monthly | Remaining ÷ months until the target date |
| Debt payoff | Month-by-month simulation with monthly compounding; minimums roll over to the next debt as each is paid off. Snowball targets the smallest balance first, avalanche the highest APR. Shown as estimates. |

## Security & privacy

- Vault uses **manual entry only**. It never asks for or stores bank usernames, passwords or credentials.
- Hosted deployments are protected by a single password (`VAULT_PASSWORD`). Vault is single-user: every query is scoped by `user_id`, so multi-user accounts would mean replacing the password gate in `server/auth.js` with per-user sign-in.

### Path to bank integrations

The schema already reserves fields for linked accounts:

- `accounts.source` (`manual`, later `linked`), `accounts.provider` and `accounts.external_id`;
- a unique `transactions.external_id`.

An aggregator integration (e.g. Plaid) would store only provider tokens, server-side and encrypted. It would upsert transactions by `external_id`, which reuses the existing duplicate-safe import path.

## Known limitations

- Currency changes the display only; amounts are not converted, and multiple currencies at once are not supported.
- Notifications appear inside the app (the bell menu). Email and push delivery would need a background job.
- Recurring transactions are projected on the calendar but not created automatically. This is deliberate, so nothing is ever duplicated without you seeing it.
