// Tests for the API. Each test gets a fresh in-memory database and a real
// server on a random free port, so your budget.db is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

// Start a throwaway server and return a small "call" helper for it.
async function startTestServer(t) {
  const db = openDb(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;

  return async function call(method, path, body, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
}

// Find a seeded category's id by name.
async function idOf(call, name) {
  const { data } = await call('GET', '/categories');
  return data.find((c) => c.name === name).id;
}

test('starter categories are seeded', async (t) => {
  const call = await startTestServer(t);
  const { data } = await call('GET', '/categories');
  assert.equal(data.length, 11);
  const names = (bucket) => data.filter((c) => c.bucket === bucket).map((c) => c.name);
  assert.deepEqual(names('income'), ['Paycheck']);
  assert.deepEqual(names('bill'), ['Phone', 'Car Insurance', 'Subscriptions']);
  assert.deepEqual(names('expense'), ['Groceries', 'Eating Out', 'Gas/Charging', 'Fun', 'Personal Care']);
  assert.deepEqual(names('savings'), ['Emergency Fund', 'Car Fund']);
  assert.deepEqual(names('debt'), []);
});

test('categories: add, rename, change bucket, archive', async (t) => {
  const call = await startTestServer(t);
  const added = await call('POST', '/categories', { name: '  Student Loan ', bucket: 'debt' });
  assert.equal(added.status, 201);
  assert.equal(added.data.name, 'Student Loan');

  // Same name in the same bucket is refused; bad input is refused.
  assert.equal((await call('POST', '/categories', { name: 'student loan', bucket: 'debt' })).status, 400);
  assert.equal((await call('POST', '/categories', { name: '', bucket: 'debt' })).status, 400);
  assert.equal((await call('POST', '/categories', { name: 'X', bucket: 'nope' })).status, 400);

  const id = added.data.id;
  const changed = await call('PATCH', `/categories/${id}`, { name: 'Loan', bucket: 'bill', archived: true });
  assert.deepEqual(changed.data, { id, name: 'Loan', bucket: 'bill', archived: 1 });
  assert.equal((await call('PATCH', '/categories/9999', { name: 'X' })).status, 404);
});

test('transactions: add, list by month, edit, delete', async (t) => {
  const call = await startTestServer(t);
  const groceries = await idOf(call, 'Groceries');

  const added = await call('POST', '/transactions', {
    date: '2026-11-05', amount_cents: 1250, category_id: groceries, note: 'milk',
  });
  assert.equal(added.status, 201);
  await call('POST', '/transactions', { date: '2026-10-31', amount_cents: 500, category_id: groceries });
  await call('POST', '/transactions', { date: '2026-12-01', amount_cents: 700, category_id: groceries });

  // Only November's transaction shows up for November.
  const november = await call('GET', '/transactions?month=2026-11');
  assert.equal(november.data.length, 1);
  assert.equal(november.data[0].category_name, 'Groceries');
  assert.equal(november.data[0].note, 'milk');

  const id = added.data.id;
  const edited = await call('PATCH', `/transactions/${id}`, { amount_cents: 1999 });
  assert.equal(edited.data.amount_cents, 1999);
  assert.equal(edited.data.date, '2026-11-05'); // untouched fields stay

  assert.equal((await call('DELETE', `/transactions/${id}`)).status, 200);
  assert.equal((await call('DELETE', `/transactions/${id}`)).status, 404);
  assert.equal((await call('GET', '/transactions?month=2026-11')).data.length, 0);
});

test('transactions: bad input is rejected', async (t) => {
  const call = await startTestServer(t);
  const groceries = await idOf(call, 'Groceries');
  const ok = { date: '2026-11-05', amount_cents: 1250, category_id: groceries };
  const bads = [
    { ...ok, amount_cents: 12.5 },      // floats are never accepted
    { ...ok, amount_cents: '1250' },    // nor text
    { ...ok, amount_cents: 0 },
    { ...ok, date: '2026-11-31' },
    { ...ok, category_id: 9999 },
    { ...ok, note: 42 },
  ];
  for (const body of bads) {
    assert.equal((await call('POST', '/transactions', body)).status, 400, JSON.stringify(body));
  }
});

test('month summary: planned, actual, totals and left to spend', async (t) => {
  const call = await startTestServer(t);
  const [paycheck, groceries, phone, fund] = await Promise.all(
    ['Paycheck', 'Groceries', 'Phone', 'Emergency Fund'].map((n) => idOf(call, n))
  );
  const month = '2026-11';
  await call('PUT', `/months/${month}/plans/${paycheck}`, { planned_cents: 300000 });
  await call('PUT', `/months/${month}/plans/${groceries}`, { planned_cents: 40000 });
  await call('PUT', `/months/${month}/plans/${phone}`, { planned_cents: 5000 });
  await call('PUT', `/months/${month}/plans/${fund}`, { planned_cents: 20000 });

  const add = (category_id, amount_cents, date = '2026-11-10') =>
    call('POST', '/transactions', { date, amount_cents, category_id });
  await add(paycheck, 150000);
  await add(groceries, 6000);
  await add(groceries, 2550);
  await add(groceries, -1000);          // a refund lowers the actual
  await add(phone, 5000);
  await add(groceries, 9999, '2026-12-01'); // other month: ignored

  const { data } = await call('GET', `/months/${month}`);
  const row = (id) => data.categories.find((c) => c.id === id);
  assert.equal(row(groceries).planned_cents, 40000);
  assert.equal(row(groceries).actual_cents, 7550);
  assert.deepEqual(data.totals.income, { planned_cents: 300000, actual_cents: 150000 });
  assert.deepEqual(data.totals.expense, { planned_cents: 40000, actual_cents: 7550 });
  assert.deepEqual(data.totals.debt, { planned_cents: 0, actual_cents: 0 });
  assert.equal(data.left_planned_cents, 300000 - (40000 + 5000 + 20000));
  assert.equal(data.left_actual_cents, 150000 - (7550 + 5000));
  assert.equal(data.has_plan, true);

  // Negative or fractional plans are refused.
  assert.equal((await call('PUT', `/months/${month}/plans/${phone}`, { planned_cents: -1 })).status, 400);
  assert.equal((await call('PUT', `/months/${month}/plans/${phone}`, { planned_cents: 1.5 })).status, 400);
});

test('archived categories stay visible only in months where they were used', async (t) => {
  const call = await startTestServer(t);
  const fun = await idOf(call, 'Fun');
  await call('POST', '/transactions', { date: '2026-10-03', amount_cents: 800, category_id: fun });
  await call('PATCH', `/categories/${fun}`, { archived: true });

  const october = await call('GET', '/months/2026-10');
  const november = await call('GET', '/months/2026-11');
  assert.ok(october.data.categories.some((c) => c.id === fun));
  assert.ok(!november.data.categories.some((c) => c.id === fun));
});

test('copy last month\'s plan', async (t) => {
  const call = await startTestServer(t);
  const groceries = await idOf(call, 'Groceries');
  const phone = await idOf(call, 'Phone');
  const fun = await idOf(call, 'Fun');
  await call('PUT', `/months/2026-12/plans/${groceries}`, { planned_cents: 40000 });
  await call('PUT', `/months/2026-12/plans/${phone}`, { planned_cents: 5000 });
  await call('PUT', `/months/2026-12/plans/${fun}`, { planned_cents: 3000 });
  await call('PATCH', `/categories/${fun}`, { archived: true });      // archived: not copied
  await call('PUT', `/months/2027-01/plans/${phone}`, { planned_cents: 6000 }); // already set: kept

  const copy = await call('POST', '/months/2027-01/copy-previous');
  assert.deepEqual(copy.data, { copied: 1, from: '2026-12' });

  const { data } = await call('GET', '/months/2027-01');
  const planned = (id) => data.categories.find((c) => c.id === id)?.planned_cents;
  assert.equal(planned(groceries), 40000);
  assert.equal(planned(phone), 6000);
  assert.equal(planned(fun), undefined);
});

test('quick-add chips: most-used categories first', async (t) => {
  const call = await startTestServer(t);
  // No history yet: expense categories lead.
  const before = await call('GET', '/categories/top');
  assert.equal(before.data.top[0].name, 'Groceries');
  assert.equal(before.data.last_category_id, null);

  const today = new Date().toISOString().slice(0, 10);
  const fun = await idOf(call, 'Fun');
  const phone = await idOf(call, 'Phone');
  await call('POST', '/transactions', { date: today, amount_cents: 100, category_id: fun });
  await call('POST', '/transactions', { date: today, amount_cents: 100, category_id: fun });
  await call('POST', '/transactions', { date: today, amount_cents: 100, category_id: phone });

  const after = await call('GET', '/categories/top');
  assert.equal(after.data.top[0].name, 'Fun');
  assert.equal(after.data.top[1].name, 'Phone');
  assert.equal(after.data.last_category_id, phone);
});

test('requests from other websites are refused', async (t) => {
  const call = await startTestServer(t);
  const evil = await call('GET', '/categories', null, { Origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  const local = await call('GET', '/categories', null, { Origin: 'http://localhost:5173' });
  assert.equal(local.status, 200);
});
