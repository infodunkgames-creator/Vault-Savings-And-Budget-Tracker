// Integration tests: real Express app + in-memory SQLite.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDemo, hasDemo } from './seed.js';

let server;
let base;
let db;
const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, data };
};
const state = async () => (await call('GET', '/api/state')).data;

beforeEach(async () => {
  db = openDb(':memory:');
  const app = createApp(db);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => new Promise((r) => server.close(r)));

describe('API', () => {
  it('starts with default categories and no records', async () => {
    const s = await state();
    expect(s.categories.filter((c) => c.kind === 'expense').map((c) => c.name)).toContain('Groceries & Eating Out');
    expect(s.transactions).toHaveLength(0);
    expect(s.hasDemo).toBe(false);
  });

  it('creates, edits and deletes a transaction, keeping the account balance consistent', async () => {
    const acct = (await call('POST', '/api/accounts', { name: 'Checking', kind: 'asset', type: 'checking', balance: 100000 })).data;
    const cat = (await state()).categories.find((c) => c.kind === 'expense');
    const t = await call('POST', '/api/transactions', { description: 'Groceries', amount: 2500, type: 'expense', category_id: cat.id, account_id: acct.id, date: '2026-11-05' });
    expect(t.status).toBe(201);
    let s = await state();
    expect(s.accounts[0].balance).toBe(97500);
    await call('PUT', `/api/transactions/${t.data.id}`, { amount: 4000 });
    s = await state();
    expect(s.accounts[0].balance).toBe(96000);
    expect(s.transactions[0].amount).toBe(4000);
    await call('DELETE', `/api/transactions/${t.data.id}`);
    s = await state();
    expect(s.accounts[0].balance).toBe(100000);
    expect(s.transactions).toHaveLength(0);
  });

  it('validates input', async () => {
    const r = await call('POST', '/api/transactions', { description: '', amount: -5, type: 'expense', date: '2026-13-01' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.data.fields)).toEqual(expect.arrayContaining(['description', 'amount', 'date']));
    const wrongKind = (await state()).categories.find((c) => c.kind === 'income');
    const r2 = await call('POST', '/api/transactions', { description: 'x', amount: 5, type: 'expense', date: '2026-11-01', category_id: wrongKind.id });
    expect(r2.status).toBe(400);
    expect((await call('PUT', '/api/transactions/9999', { amount: 5 })).status).toBe(404);
  });

  it('imports CSV rows without creating duplicates on re-import', async () => {
    const rows = [
      { date: '2026-11-01', description: 'Coffee', amount: 450, type: 'expense' },
      { date: '2026-11-01', description: 'Coffee', amount: 450, type: 'expense' }, // a genuine second coffee
      { date: '2026-11-02', description: 'Paycheck', amount: 200000, type: 'income', category: 'paycheck' },
      { date: 'nope', description: 'Bad', amount: 1, type: 'expense' },
    ];
    const first = await call('POST', '/api/import/transactions', { rows });
    expect(first.data).toMatchObject({ imported: 3, duplicates: 0 });
    expect(first.data.errors).toHaveLength(1);
    const second = await call('POST', '/api/import/transactions', { rows });
    expect(second.data).toMatchObject({ imported: 0, duplicates: 3 });
    const s = await state();
    expect(s.transactions).toHaveLength(3);
    expect(s.transactions.find((t) => t.description === 'Paycheck').category_id).toBe(s.categories.find((c) => c.name === 'Paycheck').id);
  });

  it('skips imported rows that match manually entered transactions', async () => {
    await call('POST', '/api/transactions', { description: 'Rent', amount: 180000, type: 'expense', date: '2026-11-01' });
    const r = await call('POST', '/api/import/transactions', { rows: [{ date: '2026-11-01', description: 'rent', amount: 180000, type: 'expense' }] });
    expect(r.data).toMatchObject({ imported: 0, duplicates: 1 });
  });

  it('records bill payments explicitly and can undo them', async () => {
    const acct = (await call('POST', '/api/accounts', { name: 'Chk', kind: 'asset', type: 'checking', balance: 300000 })).data;
    const b = (await call('POST', '/api/bills', { name: 'Rent', amount: 150000, frequency: 'monthly', anchor_date: '2026-01-01', account_id: acct.id })).data;
    let s = await state();
    expect(s.billPayments).toHaveLength(0); // never auto-paid
    const p = await call('POST', `/api/bills/${b.id}/pay`, { due_date: '2026-11-01', paid_date: '2026-11-01', amount: 150000, record_transaction: true });
    expect(p.status).toBe(201);
    expect((await call('POST', `/api/bills/${b.id}/pay`, { due_date: '2026-11-01', paid_date: '2026-11-01', amount: 150000 })).status).toBe(409);
    s = await state();
    expect(s.transactions).toHaveLength(1);
    expect(s.accounts[0].balance).toBe(150000);
    await call('DELETE', `/api/bill-payments/${p.data.id}`);
    s = await state();
    expect(s.billPayments).toHaveLength(0);
    expect(s.transactions).toHaveLength(0);
    expect(s.accounts[0].balance).toBe(300000);
  });

  it('goal contributions, withdrawals and limits', async () => {
    const g = (await call('POST', '/api/goals', { name: 'Trip', target: 100000 })).data;
    await call('POST', `/api/goals/${g.id}/contributions`, { amount: 30000, date: '2026-11-01' });
    const bad = await call('POST', `/api/goals/${g.id}/contributions`, { amount: -50000, date: '2026-11-02' });
    expect(bad.status).toBe(400);
    await call('POST', `/api/goals/${g.id}/contributions`, { amount: -10000, date: '2026-11-02' });
    const s = await state();
    expect(s.goalContributions.reduce((a, c) => a + c.amount, 0)).toBe(20000);
  });

  it('debt payments reduce the balance and can be reversed', async () => {
    const d = (await call('POST', '/api/debts', { name: 'Card', type: 'credit_card', original_balance: 100000, current_balance: 80000, apr: 20, min_payment: 3000, due_day: 10 })).data;
    expect((await call('POST', `/api/debts/${d.id}/payments`, { amount: 90000, date: '2026-11-01' })).status).toBe(400);
    const p = (await call('POST', `/api/debts/${d.id}/payments`, { amount: 30000, date: '2026-11-01', record_transaction: true })).data;
    let s = await state();
    expect(s.debts[0].current_balance).toBe(50000);
    expect(s.transactions[0].category_id).toBe(s.categories.find((c) => c.name === 'Debt Payments').id);
    await call('DELETE', `/api/debt-payments/${p.id}`);
    s = await state();
    expect(s.debts[0].current_balance).toBe(80000);
    expect(s.transactions).toHaveLength(0);
  });

  it('keeps a net worth snapshot for the current month', async () => {
    await call('POST', '/api/accounts', { name: 'Savings', kind: 'asset', type: 'savings', balance: 500000 });
    await call('POST', '/api/debts', { name: 'Loan', type: 'auto_loan', original_balance: 200000, current_balance: 150000 });
    const s = await state();
    const snap = s.netWorthSnapshots.at(-1);
    expect(snap.assets - snap.liabilities).toBe(350000);
  });

  it('budget overrides, batch carry-forward and reset', async () => {
    const cat = (await state()).categories.find((c) => c.kind === 'expense');
    await call('PUT', '/api/budgets/override', { category_id: cat.id, month: '2026-12', amount: 99900 });
    await call('POST', '/api/budgets/batch', { month: '2026-12', items: [{ category_id: cat.id, amount: 12345 }] });
    let s = await state();
    expect(s.budgetOverrides).toHaveLength(1);
    expect(s.budgetOverrides[0].amount).toBe(12345);
    await call('POST', '/api/budgets/reset', { month: '2026-12' });
    s = await state();
    expect(s.budgetOverrides).toHaveLength(0);
  });

  it('category CRUD rejects duplicates and unlinks transactions on delete', async () => {
    const c = (await call('POST', '/api/categories', { name: 'Pets', kind: 'expense', budget: 5000 })).data;
    expect((await call('POST', '/api/categories', { name: 'pets', kind: 'expense' })).status).toBe(400);
    const t = (await call('POST', '/api/transactions', { description: 'Food', amount: 100, type: 'expense', date: '2026-11-01', category_id: c.id })).data;
    await call('DELETE', `/api/categories/${c.id}`);
    const s = await state();
    expect(s.transactions.find((x) => x.id === t.id).category_id).toBeNull();
  });

  it('demo data is tagged and removable without touching user data', async () => {
    seedDemo(db, 1);
    await call('POST', '/api/transactions', { description: 'Mine', amount: 100, type: 'expense', date: '2026-11-01' });
    let s = await state();
    expect(s.hasDemo).toBe(true);
    expect(s.transactions.length).toBeGreaterThan(100);
    expect(s.transactions.filter((t) => !t.is_demo)).toHaveLength(1);
    await call('DELETE', '/api/demo');
    s = await state();
    expect(hasDemo(db, 1)).toBeFalsy();
    expect(s.transactions.map((t) => t.description)).toEqual(['Mine']);
  });

  it('export → restore round-trips all data', async () => {
    seedDemo(db, 1);
    const before = await state();
    const backup = (await call('GET', '/api/export')).data;
    await call('DELETE', '/api/data?confirm=DELETE');
    expect((await state()).transactions).toHaveLength(0);
    const r = await call('POST', '/api/restore', backup);
    expect(r.status).toBe(201);
    const after = await state();
    expect(after.transactions.length).toBe(before.transactions.length);
    expect(after.accounts.map((a) => a.balance)).toEqual(before.accounts.map((a) => a.balance));
    expect(after.goalContributions.length).toBe(before.goalContributions.length);
  });

  it('exports transactions as CSV and neutralises formulas', async () => {
    await call('POST', '/api/transactions', { description: '=HYPERLINK("x")', amount: 1234, type: 'expense', date: '2026-11-01' });
    const r = await call('GET', '/api/export/transactions.csv');
    expect(r.data.split('\n')[0]).toBe('Date,Time,Description,Type,Amount,Category,Account,Notes,Recurring');
    expect(r.data).toContain(`"'=HYPERLINK(""x"")"`);
    expect(r.data).toContain('12.34');
  });

  it('requires explicit confirmation to wipe data', async () => {
    expect((await call('DELETE', '/api/data')).status).toBe(400);
  });
});
