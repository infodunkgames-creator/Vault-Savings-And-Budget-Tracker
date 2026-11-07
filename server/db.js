// Database layer — SQLite via Node's built-in `node:sqlite` (no native build step).
// All money values are stored as INTEGER cents to avoid floating point drift.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Loaded via require so bundlers/test runners that don't know the newer `node:sqlite` builtin still resolve it.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  color TEXT NOT NULL DEFAULT '#85879D',
  icon TEXT NOT NULL DEFAULT '•',
  budget INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, kind, name)
);

CREATE TABLE IF NOT EXISTS budget_overrides (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  UNIQUE (category_id, month)
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('asset','liability')),
  type TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  include_in_available INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',   -- 'manual' today; 'linked' reserved for future bank integrations
  provider TEXT,                            -- future: aggregator name (never credentials)
  external_id TEXT,                         -- future: aggregator account id
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS income_sources (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  expected_amount INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  anchor_date TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  income_source_id INTEGER REFERENCES income_sources(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  time TEXT,
  notes TEXT,
  recurring TEXT,
  import_hash TEXT,
  external_id TEXT,                          -- future: aggregator transaction id
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tx_import_hash ON transactions(user_id, import_hash) WHERE import_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tx_external_id ON transactions(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tx_date ON transactions(user_id, date);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL,
  anchor_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  paid_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bill_id, due_date)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎯',
  color TEXT NOT NULL DEFAULT '#00D9A0',
  target INTEGER NOT NULL CHECK (target > 0),
  target_date TEXT,
  description TEXT,
  monthly_contribution INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  date TEXT NOT NULL,
  note TEXT,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  original_balance INTEGER NOT NULL,
  current_balance INTEGER NOT NULL,
  apr REAL NOT NULL DEFAULT 0,
  min_payment INTEGER NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  note TEXT,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS networth_snapshots (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  assets INTEGER NOT NULL,
  liabilities INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, month)
);

CREATE TABLE IF NOT EXISTS notification_dismissals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
`;

export function openDb(file) {
  const target = file ?? process.env.VAULT_DB ?? path.resolve('data', 'vault.db');
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

/** Run fn inside a single SQLite transaction. Rolls back on any thrown error. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const TABLES_IN_RESTORE_ORDER = [
  'categories', 'budget_overrides', 'accounts', 'income_sources', 'transactions',
  'bills', 'bill_payments', 'goals', 'goal_contributions', 'debts', 'debt_payments',
  'networth_snapshots', 'notification_dismissals', 'settings',
];
