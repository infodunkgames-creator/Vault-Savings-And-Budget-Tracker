import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { tx, TABLES_IN_RESTORE_ORDER } from './db.js';
import { ensureUser, seedDemo, clearDemo, hasDemo, getSetting, setSetting, seedDefaults, DEFAULT_SETTINGS } from './seed.js';
import { validate, HttpError, FREQUENCIES } from './validate.js';
import { todayISO, monthOf } from './dates.js';

const ACCOUNT_ASSET_TYPES = ['checking', 'savings', 'cash', 'investment', 'retirement', 'vehicle', 'property', 'other_asset'];
const ACCOUNT_LIABILITY_TYPES = ['credit_card', 'student_loan', 'auto_loan', 'personal_loan', 'mortgage', 'other_liability'];
const DEBT_TYPES = ['credit_card', 'student_loan', 'auto_loan', 'personal_loan', 'mortgage', 'medical', 'other'];
const INCOME_TYPES = ['paycheck', 'freelance', 'side_hustle', 'investment', 'other'];
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

const SPECS = {
  transaction: {
    description: { type: 'string', required: true, max: 120 },
    amount: { type: 'cents', required: true, min: 1 },
    type: { type: 'enum', values: ['income', 'expense'], required: true },
    category_id: { type: 'ref' },
    account_id: { type: 'ref' },
    income_source_id: { type: 'ref' },
    date: { type: 'date', required: true },
    time: { type: 'time' },
    notes: { type: 'string', max: 1000 },
    recurring: { type: 'enum', values: FREQUENCIES.filter((f) => f !== 'once') },
  },
  category: {
    name: { type: 'string', required: true, max: 40 },
    kind: { type: 'enum', values: ['expense', 'income'], required: true },
    color: { type: 'color', default: '#85879D' },
    icon: { type: 'string', max: 8, default: '•' },
    budget: { type: 'cents', default: 0 },
  },
  account: {
    name: { type: 'string', required: true, max: 60 },
    kind: { type: 'enum', values: ['asset', 'liability'], required: true },
    type: { type: 'enum', values: [...ACCOUNT_ASSET_TYPES, ...ACCOUNT_LIABILITY_TYPES], required: true },
    balance: { type: 'cents', required: true },
    verified: { type: 'bool', default: 0 },
    include_in_available: { type: 'bool', default: 0 },
    notes: { type: 'string', max: 500 },
  },
  income_source: {
    name: { type: 'string', required: true, max: 60 },
    type: { type: 'enum', values: INCOME_TYPES, required: true },
    expected_amount: { type: 'cents', required: true, min: 1 },
    frequency: { type: 'enum', values: FREQUENCIES, required: true },
    anchor_date: { type: 'date', required: true },
    account_id: { type: 'ref' },
    active: { type: 'bool', default: 1 },
    notes: { type: 'string', max: 500 },
  },
  bill: {
    name: { type: 'string', required: true, max: 60 },
    amount: { type: 'cents', required: true, min: 1 },
    category_id: { type: 'ref' },
    account_id: { type: 'ref' },
    frequency: { type: 'enum', values: FREQUENCIES, required: true },
    anchor_date: { type: 'date', required: true },
    active: { type: 'bool', default: 1 },
    notes: { type: 'string', max: 500 },
  },
  goal: {
    name: { type: 'string', required: true, max: 60 },
    emoji: { type: 'string', max: 8, default: '🎯' },
    color: { type: 'color', default: '#00D9A0' },
    target: { type: 'cents', required: true, min: 1 },
    target_date: { type: 'date' },
    description: { type: 'string', max: 500 },
    monthly_contribution: { type: 'cents', default: 0 },
    archived: { type: 'bool', default: 0 },
  },
  debt: {
    name: { type: 'string', required: true, max: 60 },
    type: { type: 'enum', values: DEBT_TYPES, required: true },
    original_balance: { type: 'cents', required: true, min: 1 },
    current_balance: { type: 'cents', required: true },
    apr: { type: 'number', min: 0, max: 100, default: 0 },
    min_payment: { type: 'cents', default: 0 },
    due_day: { type: 'int', min: 1, max: 31, default: 1 },
    notes: { type: 'string', max: 500 },
  },
};

const TABLE_FOR = {
  transaction: 'transactions', category: 'categories', account: 'accounts', income_source: 'income_sources',
  bill: 'bills', goal: 'goals', debt: 'debts',
};

export function createApp(db, { staticDir } = {}) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // --- Auth seam ---------------------------------------------------------------------------
  // Vault runs in single-user local mode: every request is scoped to user 1. All queries below
  // are already filtered by req.userId, so swapping this middleware for real session auth is
  // enough to isolate multiple users' data.
  ensureUser(db, 1);
  app.use('/api', (req, _res, next) => { req.userId = 1; next(); });

  const q = {
    get: (sql, ...p) => db.prepare(sql).get(...p),
    all: (sql, ...p) => db.prepare(sql).all(...p),
    run: (sql, ...p) => db.prepare(sql).run(...p),
  };

  const owned = (table, id, userId, label = 'Record') => {
    const row = q.get(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`, id, userId);
    if (!row) throw new HttpError(404, `${label} not found`);
    return row;
  };

  function checkRefs(userId, data, { txType } = {}) {
    if (data.category_id != null) {
      const c = owned('categories', data.category_id, userId, 'Category');
      if (txType && c.kind !== txType) throw new HttpError(400, `category_id: Category "${c.name}" is for ${c.kind}, not ${txType}`, { category_id: 'Wrong kind' });
    }
    if (data.account_id != null) owned('accounts', data.account_id, userId, 'Account');
    if (data.income_source_id != null) owned('income_sources', data.income_source_id, userId, 'Income source');
  }

  // Keep account balances in step with linked transactions.
  function applyTxToAccount(t, sign) {
    if (!t.account_id) return;
    const acct = q.get('SELECT kind FROM accounts WHERE id = ?', t.account_id);
    if (!acct) return;
    let delta = (t.type === 'income' ? t.amount : -t.amount) * sign;
    if (acct.kind === 'liability') delta = -delta; // spending on a credit card increases what you owe
    q.run("UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?", delta, t.account_id);
  }
  function adjustAsset(accountId, delta) {
    if (!accountId) return;
    const acct = q.get('SELECT kind FROM accounts WHERE id = ?', accountId);
    if (!acct) return;
    q.run("UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?", acct.kind === 'liability' ? -delta : delta, accountId);
  }

  function insert(table, userId, data, extra = {}) {
    const row = { ...data, ...extra, user_id: userId };
    const cols = Object.keys(row);
    const info = q.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => row[c]));
    return q.get(`SELECT * FROM ${table} WHERE id = ?`, Number(info.lastInsertRowid));
  }
  function update(table, id, data) {
    const cols = Object.keys(data);
    if (cols.length) q.run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => data[c]), id);
    return q.get(`SELECT * FROM ${table} WHERE id = ?`, id);
  }

  function refreshSnapshot(userId) {
    const a = q.get("SELECT COALESCE(SUM(balance),0) s FROM accounts WHERE user_id = ? AND kind='asset'", userId).s;
    const l1 = q.get("SELECT COALESCE(SUM(balance),0) s FROM accounts WHERE user_id = ? AND kind='liability'", userId).s;
    const l2 = q.get('SELECT COALESCE(SUM(current_balance),0) s FROM debts WHERE user_id = ?', userId).s;
    q.run(`INSERT INTO networth_snapshots (user_id, month, assets, liabilities, is_demo) VALUES (?,?,?,?,0)
      ON CONFLICT(user_id, month) DO UPDATE SET assets = excluded.assets, liabilities = excluded.liabilities, is_demo = 0`,
    userId, monthOf(todayISO()), a, l1 + l2);
  }

  /** Wrap a mutating handler: runs atomically, refreshes the net-worth snapshot, returns JSON. */
  const mutate = (fn) => (req, res, next) => {
    try {
      const result = tx(db, () => {
        const out = fn(req, res);
        refreshSnapshot(req.userId);
        return out;
      });
      res.status(req.method === 'POST' ? 201 : 200).json(result ?? { ok: true });
    } catch (err) {
      next(err);
    }
  };
  const read = (fn) => (req, res, next) => {
    try { res.json(fn(req, res)); } catch (err) { next(err); }
  };
  const id = (req) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
    return n;
  };

  // --- State -------------------------------------------------------------------------------
  function loadState(userId) {
    const settings = {};
    for (const k of SETTING_KEYS) settings[k] = { ...DEFAULT_SETTINGS[k], ...getSetting(db, userId, k) };
    return {
      today: todayISO(),
      hasDemo: Boolean(hasDemo(db, userId)),
      settings,
      categories: q.all('SELECT * FROM categories WHERE user_id = ? ORDER BY kind, sort, name', userId),
      budgetOverrides: q.all('SELECT * FROM budget_overrides WHERE user_id = ?', userId),
      accounts: q.all('SELECT * FROM accounts WHERE user_id = ? ORDER BY kind, balance DESC', userId),
      incomeSources: q.all('SELECT * FROM income_sources WHERE user_id = ? ORDER BY name', userId),
      transactions: q.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, time DESC, id DESC', userId),
      bills: q.all('SELECT * FROM bills WHERE user_id = ? ORDER BY name', userId),
      billPayments: q.all('SELECT * FROM bill_payments WHERE user_id = ?', userId),
      goals: q.all('SELECT * FROM goals WHERE user_id = ? ORDER BY archived, created_at, id', userId),
      goalContributions: q.all('SELECT * FROM goal_contributions WHERE user_id = ? ORDER BY date DESC, id DESC', userId),
      debts: q.all('SELECT * FROM debts WHERE user_id = ? ORDER BY current_balance DESC', userId),
      debtPayments: q.all('SELECT * FROM debt_payments WHERE user_id = ? ORDER BY date DESC, id DESC', userId),
      netWorthSnapshots: q.all('SELECT * FROM networth_snapshots WHERE user_id = ? ORDER BY month', userId),
      dismissedNotifications: q.all('SELECT key FROM notification_dismissals WHERE user_id = ?', userId).map((r) => r.key),
    };
  }
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/state', (req, res, next) => {
    try {
      tx(db, () => refreshSnapshot(req.userId));
      res.json(loadState(req.userId));
    } catch (e) { next(e); }
  });

  // --- Transactions ------------------------------------------------------------------------
  app.post('/api/transactions', mutate((req) => {
    const data = validate(req.body, SPECS.transaction);
    checkRefs(req.userId, data, { txType: data.type });
    const row = insert('transactions', req.userId, data);
    applyTxToAccount(row, +1);
    return row;
  }));
  app.put('/api/transactions/:id', mutate((req) => {
    const existing = owned('transactions', id(req), req.userId, 'Transaction');
    const data = validate(req.body, SPECS.transaction, { partial: true });
    const merged = { ...existing, ...data };
    checkRefs(req.userId, merged, { txType: merged.type });
    applyTxToAccount(existing, -1);
    const row = update('transactions', existing.id, { ...data, updated_at: new Date().toISOString(), is_demo: 0 });
    applyTxToAccount(row, +1);
    return row;
  }));
  app.delete('/api/transactions/:id', mutate((req) => {
    const existing = owned('transactions', id(req), req.userId, 'Transaction');
    applyTxToAccount(existing, -1);
    q.run('DELETE FROM transactions WHERE id = ?', existing.id);
    return { ok: true, id: existing.id };
  }));
  app.post('/api/transactions/bulk-delete', mutate((req) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Number.isInteger) : [];
    if (!ids.length) throw new HttpError(400, 'No transactions selected');
    let count = 0;
    for (const tid of ids) {
      const row = q.get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', tid, req.userId);
      if (!row) continue;
      applyTxToAccount(row, -1);
      q.run('DELETE FROM transactions WHERE id = ?', tid);
      count++;
    }
    return { ok: true, deleted: count };
  }));

  // CSV import: rows are parsed + mapped client-side, validated and de-duplicated here.
  app.post('/api/import/transactions', mutate((req) => {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import');
    if (rows.length > 20000) throw new HttpError(400, 'Too many rows (max 20,000 per import)');
    const accountId = req.body.account_id ?? null;
    if (accountId != null) owned('accounts', accountId, req.userId, 'Account');
    const cats = q.all('SELECT id, name, kind FROM categories WHERE user_id = ?', req.userId);
    const findCat = (name, kind) => {
      if (!name) return null;
      const n = String(name).trim().toLowerCase();
      return cats.find((c) => c.kind === kind && c.name.toLowerCase() === n)?.id ?? null;
    };
    const seenInFile = new Map();
    const result = { imported: 0, duplicates: 0, errors: [] };
    rows.forEach((raw, i) => {
      try {
        const data = validate({
          description: raw.description, amount: raw.amount, type: raw.type, date: raw.date,
          notes: raw.notes ?? null, time: raw.time ?? null,
        }, SPECS.transaction);
        const key = `${data.date}|${data.type}|${data.amount}|${data.description.toLowerCase()}`;
        const ordinal = seenInFile.get(key) ?? 0;
        seenInFile.set(key, ordinal + 1);
        const hash = crypto.createHash('sha256').update(`${key}#${ordinal}`).digest('hex').slice(0, 32);
        if (q.get('SELECT 1 FROM transactions WHERE user_id = ? AND import_hash = ?', req.userId, hash)) { result.duplicates++; return; }
        // Also treat as duplicate if the same transaction was already entered manually.
        const manual = q.get(`SELECT COUNT(*) c FROM transactions WHERE user_id = ? AND import_hash IS NULL AND date = ? AND type = ? AND amount = ?
          AND lower(description) = ?`, req.userId, data.date, data.type, data.amount, data.description.toLowerCase()).c;
        if (ordinal < manual) { result.duplicates++; return; }
        const row = insert('transactions', req.userId, {
          ...data, category_id: findCat(raw.category, data.type), account_id: accountId, import_hash: hash,
        });
        applyTxToAccount(row, +1);
        result.imported++;
      } catch (err) {
        if (result.errors.length < 50) result.errors.push({ row: i + 1, message: err.message });
      }
    });
    return result;
  }));

  // --- Generic CRUD for simple resources ----------------------------------------------------
  function crud(resource, base, { beforeSave, onDelete } = {}) {
    const table = TABLE_FOR[resource];
    const spec = SPECS[resource];
    app.post(`/api/${base}`, mutate((req) => {
      const data = validate(req.body, spec);
      checkRefs(req.userId, data);
      beforeSave?.(req, data, null);
      return insert(table, req.userId, data);
    }));
    app.put(`/api/${base}/:id`, mutate((req) => {
      const existing = owned(table, id(req), req.userId);
      const data = validate(req.body, spec, { partial: true });
      checkRefs(req.userId, data);
      beforeSave?.(req, data, existing);
      const extra = 'is_demo' in existing ? { is_demo: 0 } : {};
      return update(table, existing.id, { ...data, ...extra });
    }));
    app.delete(`/api/${base}/:id`, mutate((req) => {
      const existing = owned(table, id(req), req.userId);
      onDelete?.(req, existing);
      q.run(`DELETE FROM ${table} WHERE id = ?`, existing.id);
      return { ok: true, id: existing.id };
    }));
  }

  crud('category', 'categories', {
    beforeSave: (req, data, existing) => {
      const name = data.name ?? existing?.name;
      const kind = data.kind ?? existing?.kind;
      if (existing && data.kind && data.kind !== existing.kind) {
        const used = q.get('SELECT 1 FROM transactions WHERE category_id = ? LIMIT 1', existing.id);
        if (used) throw new HttpError(400, 'kind: Cannot change the type of a category that has transactions');
      }
      const dup = q.get('SELECT id FROM categories WHERE user_id = ? AND kind = ? AND lower(name) = lower(?) AND id != ?', req.userId, kind, name, existing?.id ?? 0);
      if (dup) throw new HttpError(400, 'name: A category with this name already exists', { name: 'Duplicate' });
    },
    onDelete: (req, cat) => {
      const to = req.query.reassign_to ? Number(req.query.reassign_to) : null;
      if (to) {
        const target = owned('categories', to, req.userId, 'Target category');
        if (target.kind !== cat.kind || target.id === cat.id) throw new HttpError(400, 'Reassign target must be a different category of the same type');
        q.run('UPDATE transactions SET category_id = ? WHERE category_id = ?', to, cat.id);
        q.run('UPDATE bills SET category_id = ? WHERE category_id = ?', to, cat.id);
      }
    },
  });
  crud('account', 'accounts', {
    beforeSave: (_req, data, existing) => {
      const kind = data.kind ?? existing?.kind;
      const type = data.type ?? existing?.type;
      const okTypes = kind === 'asset' ? ACCOUNT_ASSET_TYPES : ACCOUNT_LIABILITY_TYPES;
      if (!okTypes.includes(type)) throw new HttpError(400, `type: "${type}" is not a valid ${kind} type`);
      if (kind === 'liability') data.include_in_available = 0;
      data.updated_at = new Date().toISOString();
    },
  });
  crud('income_source', 'income-sources');
  crud('bill', 'bills');
  crud('goal', 'goals');
  crud('debt', 'debts', {
    beforeSave: (_req, data, existing) => {
      const orig = data.original_balance ?? existing?.original_balance;
      const cur = data.current_balance ?? existing?.current_balance;
      if (cur > orig) data.original_balance = cur; // balance grew (e.g. new charges): treat as the new starting point
    },
  });

  // --- Budgets -----------------------------------------------------------------------------
  app.put('/api/budgets/override', mutate((req) => {
    const data = validate(req.body, { category_id: { type: 'ref', required: true }, month: { type: 'month', required: true }, amount: { type: 'cents', required: true }, note: { type: 'string', max: 200 } });
    owned('categories', data.category_id, req.userId, 'Category');
    q.run(`INSERT INTO budget_overrides (user_id, category_id, month, amount, note) VALUES (?,?,?,?,?)
      ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount, note = excluded.note`,
    req.userId, data.category_id, data.month, data.amount, data.note ?? null);
    return q.get('SELECT * FROM budget_overrides WHERE category_id = ? AND month = ?', data.category_id, data.month);
  }));
  app.delete('/api/budgets/override', mutate((req) => {
    const data = validate(req.body, { category_id: { type: 'ref', required: true }, month: { type: 'month', required: true } });
    q.run('DELETE FROM budget_overrides WHERE user_id = ? AND category_id = ? AND month = ?', req.userId, data.category_id, data.month);
    return { ok: true };
  }));
  // Carry forward: computed client-side (it needs the same budget math the UI shows) and sent as a batch.
  app.post('/api/budgets/batch', mutate((req) => {
    const month = validate({ month: req.body?.month }, { month: { type: 'month', required: true } }).month;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const it of items) {
      const d = validate(it, { category_id: { type: 'ref', required: true }, amount: { type: 'cents', required: true }, note: { type: 'string', max: 200 } });
      owned('categories', d.category_id, req.userId, 'Category');
      q.run(`INSERT INTO budget_overrides (user_id, category_id, month, amount, note) VALUES (?,?,?,?,?)
        ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount, note = excluded.note`, req.userId, d.category_id, month, d.amount, d.note ?? null);
    }
    return { ok: true, count: items.length };
  }));
  app.post('/api/budgets/reset', mutate((req) => {
    const { month } = validate(req.body, { month: { type: 'month', required: true } });
    const info = q.run('DELETE FROM budget_overrides WHERE user_id = ? AND month = ?', req.userId, month);
    return { ok: true, removed: Number(info.changes) };
  }));

  // --- Bills: payments are always an explicit user action ----------------------------------
  app.post('/api/bills/:id/pay', mutate((req) => {
    const bill = owned('bills', id(req), req.userId, 'Bill');
    const data = validate(req.body, {
      due_date: { type: 'date', required: true }, paid_date: { type: 'date', required: true },
      amount: { type: 'cents', required: true, min: 1 }, account_id: { type: 'ref' }, record_transaction: { type: 'bool', default: 1 },
    });
    if (q.get('SELECT 1 FROM bill_payments WHERE bill_id = ? AND due_date = ?', bill.id, data.due_date)) throw new HttpError(409, 'This bill is already marked paid for that due date');
    checkRefs(req.userId, { account_id: data.account_id });
    let transactionId = null;
    if (data.record_transaction) {
      const cat = bill.category_id ? q.get("SELECT id FROM categories WHERE id = ? AND kind = 'expense'", bill.category_id) : null;
      const t = insert('transactions', req.userId, {
        description: bill.name, amount: data.amount, type: 'expense', category_id: cat?.id ?? null,
        account_id: data.account_id ?? bill.account_id ?? null, date: data.paid_date, time: null, notes: `Bill payment (due ${data.due_date})`,
        recurring: bill.frequency === 'once' ? null : bill.frequency,
      });
      applyTxToAccount(t, +1);
      transactionId = t.id;
    }
    return insert('bill_payments', req.userId, { bill_id: bill.id, due_date: data.due_date, paid_date: data.paid_date, amount: data.amount, transaction_id: transactionId });
  }));
  app.delete('/api/bill-payments/:id', mutate((req) => {
    const p = owned('bill_payments', id(req), req.userId, 'Payment');
    if (p.transaction_id && req.query.keep_transaction !== '1') {
      const t = q.get('SELECT * FROM transactions WHERE id = ?', p.transaction_id);
      if (t) { applyTxToAccount(t, -1); q.run('DELETE FROM transactions WHERE id = ?', t.id); }
    }
    q.run('DELETE FROM bill_payments WHERE id = ?', p.id);
    return { ok: true };
  }));

  // --- Goals: contributions + withdrawals --------------------------------------------------
  app.post('/api/goals/:id/contributions', mutate((req) => {
    const goal = owned('goals', id(req), req.userId, 'Goal');
    const data = validate(req.body, { amount: { type: 'signedCents', required: true }, date: { type: 'date', required: true }, note: { type: 'string', max: 200 }, account_id: { type: 'ref' } });
    checkRefs(req.userId, { account_id: data.account_id });
    const saved = q.get('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE goal_id = ?', goal.id).s;
    if (data.amount < 0 && saved + data.amount < 0) throw new HttpError(400, `amount: You can withdraw at most ${(saved / 100).toFixed(2)}`, { amount: 'Exceeds saved amount' });
    // Contribution moves money out of the funding account; a withdrawal moves it back.
    adjustAsset(data.account_id, -data.amount);
    return insert('goal_contributions', req.userId, { ...data, goal_id: goal.id });
  }));
  app.delete('/api/goal-contributions/:id', mutate((req) => {
    const c = owned('goal_contributions', id(req), req.userId, 'Contribution');
    const saved = q.get('SELECT COALESCE(SUM(amount),0) s FROM goal_contributions WHERE goal_id = ?', c.goal_id).s;
    if (saved - c.amount < 0) throw new HttpError(400, 'Removing this deposit would make the goal balance negative. Remove the later withdrawal first.');
    adjustAsset(c.account_id, c.amount);
    q.run('DELETE FROM goal_contributions WHERE id = ?', c.id);
    return { ok: true };
  }));

  // --- Debts: payments ---------------------------------------------------------------------
  app.post('/api/debts/:id/payments', mutate((req) => {
    const debt = owned('debts', id(req), req.userId, 'Debt');
    const data = validate(req.body, {
      amount: { type: 'cents', required: true, min: 1 }, date: { type: 'date', required: true },
      note: { type: 'string', max: 200 }, account_id: { type: 'ref' }, record_transaction: { type: 'bool', default: 1 },
    });
    if (data.amount > debt.current_balance) throw new HttpError(400, `amount: Payment exceeds the remaining balance of ${(debt.current_balance / 100).toFixed(2)}`, { amount: 'Too large' });
    checkRefs(req.userId, { account_id: data.account_id });
    let transactionId = null;
    if (data.record_transaction) {
      const cat = q.get("SELECT id FROM categories WHERE user_id = ? AND kind = 'expense' AND name = 'Debt Payments'", req.userId);
      const t = insert('transactions', req.userId, {
        description: `${debt.name} payment`, amount: data.amount, type: 'expense', category_id: cat?.id ?? null,
        account_id: data.account_id ?? null, date: data.date, time: null, notes: data.note ?? null, recurring: null,
      });
      applyTxToAccount(t, +1);
      transactionId = t.id;
    }
    q.run('UPDATE debts SET current_balance = current_balance - ?, is_demo = is_demo WHERE id = ?', data.amount, debt.id);
    return insert('debt_payments', req.userId, { debt_id: debt.id, amount: data.amount, date: data.date, note: data.note ?? null, transaction_id: transactionId });
  }));
  app.delete('/api/debt-payments/:id', mutate((req) => {
    const p = owned('debt_payments', id(req), req.userId, 'Payment');
    q.run('UPDATE debts SET current_balance = current_balance + ? WHERE id = ?', p.amount, p.debt_id);
    if (p.transaction_id && req.query.keep_transaction !== '1') {
      const t = q.get('SELECT * FROM transactions WHERE id = ?', p.transaction_id);
      if (t) { applyTxToAccount(t, -1); q.run('DELETE FROM transactions WHERE id = ?', t.id); }
    }
    q.run('DELETE FROM debt_payments WHERE id = ?', p.id);
    return { ok: true };
  }));

  // --- Settings & notifications ------------------------------------------------------------
  app.put('/api/settings/:key', mutate((req) => {
    const key = req.params.key;
    if (!SETTING_KEYS.includes(key)) throw new HttpError(400, 'Unknown setting');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new HttpError(400, 'Setting value must be an object');
    const allowed = Object.keys(DEFAULT_SETTINGS[key]);
    const current = getSetting(db, req.userId, key);
    const next = { ...current };
    for (const [k, v] of Object.entries(req.body)) {
      if (!allowed.includes(k) && key !== 'meta') continue;
      if (typeof v === 'string' && v.length > 200) throw new HttpError(400, `${k}: Too long`);
      next[k] = v;
    }
    if (key === 'notifications') {
      next.billLeadDays = Math.min(30, Math.max(0, Math.round(Number(next.billLeadDays) || 0)));
      next.budgetThreshold = Math.min(100, Math.max(1, Math.round(Number(next.budgetThreshold) || 80)));
    }
    if (key === 'profile' && (!next.name || !String(next.name).trim())) throw new HttpError(400, 'name: Required', { name: 'Required' });
    setSetting(db, req.userId, key, next);
    return next;
  }));
  app.post('/api/notifications/dismiss', mutate((req) => {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys.filter((k) => typeof k === 'string' && k.length < 200) : [];
    for (const k of keys) q.run('INSERT OR IGNORE INTO notification_dismissals (user_id, key) VALUES (?, ?)', req.userId, k);
    return { ok: true };
  }));
  app.delete('/api/notifications/dismiss', mutate((req) => {
    q.run('DELETE FROM notification_dismissals WHERE user_id = ?', req.userId);
    return { ok: true };
  }));

  // --- Demo data, backup / restore ---------------------------------------------------------
  app.post('/api/demo', mutate((req) => {
    if (hasDemo(db, req.userId)) throw new HttpError(409, 'Demo data is already loaded');
    seedDemo(db, req.userId);
    return { ok: true };
  }));
  app.delete('/api/demo', mutate((req) => {
    clearDemo(db, req.userId);
    return { ok: true };
  }));
  app.delete('/api/data', mutate((req) => {
    if (req.query.confirm !== 'DELETE') throw new HttpError(400, 'Confirmation required');
    for (const t of [...TABLES_IN_RESTORE_ORDER].reverse()) q.run(`DELETE FROM ${t} WHERE user_id = ?`, req.userId);
    seedDefaults(db, req.userId);
    setSetting(db, req.userId, 'meta', { onboarded: true });
    return { ok: true };
  }));

  app.get('/api/export', read((req, res) => {
    const data = {};
    for (const t of TABLES_IN_RESTORE_ORDER) data[t] = q.all(`SELECT * FROM ${t} WHERE user_id = ?`, req.userId);
    res.setHeader('Content-Disposition', `attachment; filename="vault-backup-${todayISO()}.json"`);
    return { app: 'vault', format: 1, exported_at: new Date().toISOString(), data };
  }));
  app.get('/api/export/transactions.csv', (req, res, next) => {
    try {
      const rows = q.all(`SELECT t.date, t.time, t.description, t.type, t.amount, c.name category, a.name account, t.notes, t.recurring
        FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC`, req.userId);
      const esc = (v) => {
        if (v == null) return '';
        let s = String(v);
        if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`; // neutralise spreadsheet formula injection
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = ['Date,Time,Description,Type,Amount,Category,Account,Notes,Recurring'];
      for (const r of rows) lines.push([r.date, r.time, r.description, r.type, (r.amount / 100).toFixed(2), r.category, r.account, r.notes, r.recurring].map(esc).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="vault-transactions-${todayISO()}.csv"`);
      res.send(lines.join('\n'));
    } catch (e) { next(e); }
  });
  app.post('/api/restore', mutate((req) => {
    const body = req.body;
    if (body?.app !== 'vault' || !body.data || typeof body.data !== 'object') throw new HttpError(400, 'This file is not a Vault backup');
    for (const t of [...TABLES_IN_RESTORE_ORDER].reverse()) q.run(`DELETE FROM ${t} WHERE user_id = ?`, req.userId);
    const counts = {};
    for (const t of TABLES_IN_RESTORE_ORDER) {
      const rows = Array.isArray(body.data[t]) ? body.data[t] : [];
      const cols = q.all(`PRAGMA table_info(${t})`).map((c) => c.name);
      for (const r of rows) {
        const row = { ...r, user_id: req.userId };
        const use = cols.filter((c) => c in row);
        q.run(`INSERT INTO ${t} (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`, ...use.map((c) => row[c]));
      }
      counts[t] = rows.length;
    }
    seedDefaults(db, req.userId); // re-adds any default category / setting missing from older backups
    return { ok: true, counts };
  }));

  // --- Static client (production) ----------------------------------------------------------
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, fields: err.fields });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (String(err?.message).includes('FOREIGN KEY')) return res.status(400).json({ error: 'Referenced record does not exist' });
    if (String(err?.message).includes('UNIQUE')) return res.status(409).json({ error: 'That record already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });
  return app;
}
