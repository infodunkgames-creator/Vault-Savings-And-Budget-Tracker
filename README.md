# Budget tracker

A private monthly budget tracker that runs only on your own computer.

- No accounts, no cloud, no analytics. The server listens on `127.0.0.1`, so nothing else on your network can reach it.
- All your data is in one file, `budget.db`, in this folder. Copy that file to back it up.
- Money is stored as whole cents, never as decimals.

## Start it

You need [Node.js](https://nodejs.org) LTS (version 22 or newer).

**Windows:** double-click `start.bat`. The first run installs what it needs, then your browser opens. Keep the black window open while you use the app; close it to stop.

**Any system, from a terminal:**

```
npm install     (first time only)
npm start
```

Then open http://127.0.0.1:4000.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the tests. They use a temporary database and never touch `budget.db`. |
| `npm run dev` | For changing the code: open http://localhost:5173 and the page updates as you save files. |

## Where things are

```
start.bat          Windows double-click starter
budget.db          your data (created on first start, not in git)
server/
  index.js         starts the server on 127.0.0.1
  app.js           builds the Express app, with the local-only safety check
  db.js            creates the tables and the starter categories
  routes.js        every /api route
  validate.js      input checks
src/               the web page (React)
  App.jsx          the screen
  api.js           talks to the server
  money.js         "12.50" <-> 1250 cents
  dates.js         date and month helpers
  styles.css       colors and layout
test/              tests
```

## Build status

- [x] Phase 1: setup, database, API, starter categories, start script
- [ ] Phase 2: quick-add and transaction list
- [ ] Phase 3: dashboard
- [ ] Phase 4: month switching, copy plan, export/import, automatic backups
