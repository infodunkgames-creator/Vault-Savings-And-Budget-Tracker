// Database setup: opens the SQLite file, creates the tables if they do not
// exist yet, and adds the starter categories the very first time.
import Database from 'better-sqlite3';

// All money columns are INTEGER cents ($12.50 is stored as 1250).
// Floats are never used for money because 0.1 + 0.2 !== 0.3 in floating point.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL,
  bucket   TEXT    NOT NULL CHECK (bucket IN ('income','expense','bill','savings','debt')),
  archived INTEGER NOT NULL DEFAULT 0          -- 0 = active, 1 = hidden from new entries
);

-- One row per (month, category) that has a planned amount.
CREATE TABLE IF NOT EXISTS month_plans (
  month         TEXT    NOT NULL,              -- 'YYYY-MM'
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  planned_cents INTEGER NOT NULL,
  PRIMARY KEY (month, category_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY,
  date         TEXT    NOT NULL,               -- 'YYYY-MM-DD'
  amount_cents INTEGER NOT NULL,               -- positive normally, negative = refund
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  note         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Makes "all transactions in a month" fast even with years of data.
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
`;

// Starter categories: [name, bucket]. Debt starts empty on purpose.
const STARTER_CATEGORIES = [
  ['Paycheck', 'income'],
  ['Phone', 'bill'],
  ['Car Insurance', 'bill'],
  ['Subscriptions', 'bill'],
  ['Groceries', 'expense'],
  ['Eating Out', 'expense'],
  ['Gas/Charging', 'expense'],
  ['Fun', 'expense'],
  ['Personal Care', 'expense'],
  ['Emergency Fund', 'savings'],
  ['Car Fund', 'savings'],
];

// Open (or create) the database at the given path.
// Pass ':memory:' to get a throwaway database, which the tests use.
export function openDb(file) {
  const db = new Database(file);

  // Make SQLite enforce the REFERENCES rules above (off by default).
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA);
  seedStarterCategories(db);
  return db;
}

// Only seeds when there are no categories at all, so it never
// overwrites or duplicates anything once you start using the app.
function seedStarterCategories(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM categories').get();
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO categories (name, bucket) VALUES (?, ?)');
  // db.transaction() makes the inserts all-or-nothing.
  const insertAll = db.transaction(() => {
    for (const [name, bucket] of STARTER_CATEGORIES) insert.run(name, bucket);
  });
  insertAll();
}
