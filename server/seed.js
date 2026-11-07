// Default configuration + optional demonstration data.
// Every demo financial record is written with is_demo = 1 so it can be removed in one action
// without touching anything the user entered themselves.
import { addDays, addMonths, daysInMonth, pad, todayISO, monthOf } from './dates.js';

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Groceries & Eating Out', icon: '🛒', color: '#00D9A0', budget: 75000 },
  { name: 'Gas & Transportation', icon: '⛽', color: '#A78BFA', budget: 35000 },
  { name: 'Rent & Housing', icon: '🏠', color: '#4285F4', budget: 180000 },
  { name: 'Utilities', icon: '💡', color: '#22D3EE', budget: 30000 },
  { name: 'Entertainment', icon: '🎬', color: '#F5C451', budget: 20000 },
  { name: 'Shopping', icon: '🛍️', color: '#F472B6', budget: 30000 },
  { name: 'Subscriptions', icon: '🔁', color: '#FB923C', budget: 8000 },
  { name: 'Personal Care', icon: '💆', color: '#C084FC', budget: 12000 },
  { name: 'Debt Payments', icon: '💳', color: '#FF5470', budget: 70000 },
  { name: 'Other', icon: '📦', color: '#85879D', budget: 15000 },
];
export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Paycheck', icon: '💼', color: '#00D9A0' },
  { name: 'Freelance', icon: '💻', color: '#4285F4' },
  { name: 'Side Hustle', icon: '🚀', color: '#A78BFA' },
  { name: 'Investments', icon: '📈', color: '#F5C451' },
  { name: 'Other Income', icon: '➕', color: '#85879D' },
];

export const DEFAULT_SETTINGS = {
  profile: { name: 'Alex Johnson', email: '' },
  preferences: { currency: 'USD', locale: 'en-US', weekStartsOn: 0, dashboardRange: '6M' },
  notifications: {
    bills: true, billLeadDays: 3,
    budgetWarning: true, budgetThreshold: 80,
    budgetOver: true,
    goalMilestones: true,
    monthlySummary: true,
  },
  meta: { onboarded: false },
};

export function ensureUser(db, userId = 1) {
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (exists) return false;
  db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(userId, 'Local user');
  seedDefaults(db, userId);
  return true;
}

export function seedDefaults(db, userId) {
  const insCat = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, name, kind, color, icon, budget, is_default, sort) VALUES (?,?,?,?,?,?,1,?)',
  );
  DEFAULT_EXPENSE_CATEGORIES.forEach((c, i) => insCat.run(userId, c.name, 'expense', c.color, c.icon, c.budget, i));
  DEFAULT_INCOME_CATEGORIES.forEach((c, i) => insCat.run(userId, c.name, 'income', c.color, c.icon, 0, i));
  const insSet = db.prepare('INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?,?,?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSet.run(userId, k, JSON.stringify(v));
}

// Deterministic PRNG so the demo looks the same on every load.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDemo(db, userId, today = todayISO()) {
  const rand = mulberry32(42);
  const between = (a, b) => Math.round(a + rand() * (b - a));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const time = () => `${pad(between(7, 21))}:${pad(between(0, 59))}`;

  const cat = {};
  for (const r of db.prepare('SELECT id, name, kind FROM categories WHERE user_id = ?').all(userId)) cat[r.name] = r.id;
  const need = (n) => cat[n] ?? null;

  // ---- Accounts (balances are a snapshot "as of today") ----
  const insAcct = db.prepare(`INSERT INTO accounts (user_id, name, kind, type, balance, verified, include_in_available, notes, is_demo)
    VALUES (?,?,?,?,?,?,?,?,1)`);
  const acct = (name, kind, type, balance, verified, avail, notes = null) =>
    Number(insAcct.run(userId, name, kind, type, balance, verified, avail, notes).lastInsertRowid);
  const checking = acct('Everyday Checking', 'asset', 'checking', 642000, 1, 1, 'Main spending account');
  acct('Wallet Cash', 'asset', 'cash', 18000, 0, 1);
  const savings = acct('High-Yield Savings', 'asset', 'savings', 1840000, 1, 0);
  acct('Brokerage', 'asset', 'investment', 3280000, 0, 0, 'Estimated from last statement');
  acct('401(k)', 'asset', 'retirement', 2460000, 1, 0);
  acct('2019 Honda Civic', 'asset', 'vehicle', 1450000, 0, 0, 'Estimated resale value');

  // ---- Debts ----
  const insDebt = db.prepare(`INSERT INTO debts (user_id, name, type, original_balance, current_balance, apr, min_payment, due_day, is_demo)
    VALUES (?,?,?,?,?,?,?,?,1)`);
  const debtStudent = Number(insDebt.run(userId, 'Federal Student Loan', 'student_loan', 1800000, 1235000, 5.5, 21000, 15).lastInsertRowid);
  const debtAuto = Number(insDebt.run(userId, 'Auto Loan', 'auto_loan', 1600000, 790000, 6.9, 34000, 5).lastInsertRowid);
  const debtCard = Number(insDebt.run(userId, 'Visa Platinum', 'credit_card', 400000, 124000, 22.99, 4500, 22).lastInsertRowid);

  // ---- Income sources ----
  const insInc = db.prepare(`INSERT INTO income_sources (user_id, name, type, expected_amount, frequency, anchor_date, account_id, is_demo)
    VALUES (?,?,?,?,?,?,?,1)`);
  // Find a Friday on/before 12 months ago as the biweekly anchor.
  let anchor = addMonths(today, -12);
  while (new Date(anchor + 'T00:00:00Z').getUTCDay() !== 5) anchor = addDays(anchor, 1);
  const srcSalary = Number(insInc.run(userId, 'Acme Corp Salary', 'paycheck', 275000, 'biweekly', anchor, checking).lastInsertRowid);
  const freelanceAnchor = `${addMonths(today, -12).slice(0, 7)}-25`;
  const srcFreelance = Number(insInc.run(userId, 'Freelance Design', 'freelance', 120000, 'monthly', freelanceAnchor, checking).lastInsertRowid);
  let divMonth = addMonths(today, -12).slice(0, 7);
  while (Number(divMonth.slice(5, 7)) % 3 !== 0) divMonth = addMonths(`${divMonth}-01`, 1).slice(0, 7);
  const divAnchor = `${divMonth}-15`;
  const srcDividends = Number(insInc.run(userId, 'Brokerage Dividends', 'investment', 18000, 'quarterly', divAnchor, null).lastInsertRowid);

  // ---- Bills ----
  const start = `${addMonths(today, -11).slice(0, 7)}-01`;
  const insBill = db.prepare(`INSERT INTO bills (user_id, name, amount, category_id, account_id, frequency, anchor_date, is_demo)
    VALUES (?,?,?,?,?, 'monthly', ?, 1)`);
  const billDefs = [
    { name: 'Rent', amount: 180000, cat: 'Rent & Housing', day: 1 },
    { name: 'Gym Membership', amount: 4000, cat: 'Personal Care', day: 3 },
    { name: 'Netflix', amount: 1549, cat: 'Subscriptions', day: 8 },
    { name: 'Electric & Gas', amount: 14000, cat: 'Utilities', day: 10 },
    { name: 'Internet', amount: 7000, cat: 'Utilities', day: 12 },
    { name: 'Phone Plan', amount: 6500, cat: 'Utilities', day: 18 },
    { name: 'Car Insurance', amount: 14200, cat: 'Gas & Transportation', day: 20 },
    { name: 'Spotify Premium', amount: 999, cat: 'Subscriptions', day: 28 },
  ].map((b) => ({ ...b, id: Number(insBill.run(userId, b.name, b.amount, need(b.cat), checking, `${start.slice(0, 7)}-${pad(b.day)}`).lastInsertRowid) }));

  // ---- Transactions ----
  const insTx = db.prepare(`INSERT INTO transactions (user_id, description, amount, type, category_id, account_id, income_source_id, date, time, notes, recurring, is_demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`);
  const tx = (description, amount, type, catName, date, opts = {}) => {
    if (date > today) return null;
    return Number(insTx.run(userId, description, amount, type, need(catName), opts.account ?? checking, opts.source ?? null,
      date, opts.time ?? time(), opts.notes ?? null, opts.recurring ?? null).lastInsertRowid);
  };
  const insBillPay = db.prepare(`INSERT INTO bill_payments (user_id, bill_id, due_date, paid_date, amount, transaction_id, is_demo) VALUES (?,?,?,?,?,?,1)`);
  const insDebtPay = db.prepare(`INSERT INTO debt_payments (user_id, debt_id, amount, date, transaction_id, is_demo) VALUES (?,?,?,?,?,1)`);

  // Paychecks
  for (let d = anchor; d <= today; d = addDays(d, 14)) {
    if (d < addMonths(today, -12)) continue;
    tx('Salary Deposit — Acme Corp', 275000, 'income', 'Paycheck', d, { source: srcSalary, time: '09:00', recurring: 'biweekly' });
  }
  for (let m = 0; m < 12; m++) {
    const monthStart = `${addMonths(today, -11 + m).slice(0, 7)}-01`;
    const [y, mo] = monthStart.split('-').map(Number);
    const dim = daysInMonth(y, mo);
    const day = (n) => `${monthStart.slice(0, 7)}-${pad(Math.min(n, dim))}`;

    tx('Freelance Project', between(80000, 160000), 'income', 'Freelance', day(25), { source: srcFreelance, time: '15:00' });
    if (mo % 3 === 0) tx('Quarterly Dividends', between(15000, 21000), 'income', 'Investments', day(15), { source: srcDividends, account: savings, time: '06:00' });

    for (const b of billDefs) {
      const due = day(b.day);
      const amount = b.name === 'Electric & Gas' ? between(11000, 17500) : b.amount;
      // Leave current-month bills that are due today or later unpaid (never auto-mark).
      if (due >= today) continue;
      const tid = tx(b.name, amount, 'expense', b.cat, due, { recurring: 'monthly', time: '08:00' });
      if (tid) insBillPay.run(userId, b.id, due, due, amount, tid);
    }

    for (const [debtId, name, amt, d] of [[debtAuto, 'Auto Loan Payment', 34000, 5], [debtStudent, 'Student Loan Payment', 21000, 15], [debtCard, 'Visa Card Payment', 15000, 22]]) {
      const date = day(d);
      if (date >= today) continue;
      const tid = tx(name, amt, 'expense', 'Debt Payments', date, { time: '07:30' });
      if (tid && m >= 6) insDebtPay.run(userId, debtId, amt, date, tid);
    }

    // Variable spending
    const grocers = ['Whole Foods Market', "Trader Joe's", 'Safeway', 'Costco'];
    const restaurants = ['Chipotle', 'Blue Bottle Coffee', 'Sushi Ran', 'Sweetgreen', 'Local Pizzeria', 'Thai Basil'];
    for (let w = 0; w < 4; w++) {
      tx(pick(grocers), between(5500, 14500), 'expense', 'Groceries & Eating Out', day(2 + w * 7 + between(0, 3)));
      for (let k = 0; k < 2; k++) tx(pick(restaurants), between(1200, 5800), 'expense', 'Groceries & Eating Out', day(1 + w * 7 + between(0, 6)));
    }
    for (let k = 0; k < 3; k++) tx(pick(['Shell Gas Station', 'Chevron']), between(3800, 6200), 'expense', 'Gas & Transportation', day(4 + k * 10));
    if (rand() > 0.4) tx('Uber', between(1400, 3600), 'expense', 'Gas & Transportation', day(between(1, 28)));
    for (let k = 0; k < between(1, 3); k++) tx(pick(['AMC Theatres', 'Steam', 'Concert Tickets', 'Bowling Night']), between(1800, 9000), 'expense', 'Entertainment', day(between(1, 28)));
    for (let k = 0; k < between(1, 3); k++) tx(pick(['Amazon', 'Target', 'Uniqlo', 'Best Buy']), between(2500, 16000), 'expense', 'Shopping', day(between(1, 28)));
    tx('iCloud Storage', 299, 'expense', 'Subscriptions', day(14), { recurring: 'monthly', time: '00:10' });
    if (rand() > 0.3) tx(pick(['Great Clips', 'CVS Pharmacy', 'Sephora']), between(1500, 6500), 'expense', 'Personal Care', day(between(1, 28)));
    if (rand() > 0.6) tx(pick(['Gift for Mom', 'Post Office', 'Dry Cleaning']), between(1000, 6000), 'expense', 'Other', day(between(1, 28)));
  }

  // ---- Goals + contribution history ----
  const insGoal = db.prepare(`INSERT INTO goals (user_id, name, emoji, color, target, target_date, description, monthly_contribution, is_demo, created_at)
    VALUES (?,?,?,?,?,?,?,?,1,?)`);
  const insContrib = db.prepare(`INSERT INTO goal_contributions (user_id, goal_id, amount, date, note, account_id, is_demo) VALUES (?,?,?,?,?,NULL,1)`);
  const goalDefs = [
    { name: 'Emergency Fund', emoji: '🛟', color: '#00D9A0', target: 1500000, current: 980000, months: 9, monthly: 60000, desc: '6 months of essential expenses' },
    { name: 'Japan Trip', emoji: '✈️', color: '#4285F4', target: 600000, current: 320000, months: 10, monthly: 40000, desc: 'Two weeks in Tokyo & Kyoto' },
    { name: 'Investment Fund', emoji: '📈', color: '#A78BFA', target: 2000000, current: 890000, months: 20, monthly: 50000 },
    { name: 'New Car', emoji: '🚗', color: '#F5C451', target: 1500000, current: 210000, months: 30, monthly: 30000, desc: 'Down payment for an EV' },
  ];
  const thisMonth = monthOf(today);
  goalDefs.forEach((g, idx) => {
    const created = `${addMonths(today, -12).slice(0, 7)}-01`;
    const id = Number(insGoal.run(userId, g.name, g.emoji, g.color, g.target, addMonths(`${thisMonth}-01`, g.months, 28).slice(0, 8) + '28', g.desc ?? null, g.monthly, created).lastInsertRowid);
    let remaining = g.current;
    // Most recent first: contribute on the 2nd of each month (only half the goals contributed this month so far).
    for (let m = 0; remaining > 0 && m < 36; m++) {
      const date = addMonths(`${thisMonth}-02`, -m);
      if (m === 0 && (idx % 2 === 1 || date > today)) continue;
      const amt = Math.min(remaining, g.monthly);
      const isFirst = remaining - amt <= 0 || m === 35;
      insContrib.run(userId, id, isFirst ? remaining : amt, date, isFirst ? 'Initial deposit' : 'Monthly contribution');
      remaining -= isFirst ? remaining : amt;
    }
  });
  // One withdrawal to show history support
  const japan = db.prepare("SELECT id FROM goals WHERE user_id=? AND name='Japan Trip' AND is_demo=1").get(userId);
  if (japan) {
    insContrib.run(userId, japan.id, -20000, addMonths(`${thisMonth}-16`, -3), 'Booked flights deposit');
    insContrib.run(userId, japan.id, 20000, addMonths(`${thisMonth}-20`, -3), 'Refilled after bonus');
  }

  // ---- Net worth history (prior months; the current month is recorded live) ----
  const insSnap = db.prepare('INSERT OR REPLACE INTO networth_snapshots (user_id, month, assets, liabilities, is_demo) VALUES (?,?,?,?,1)');
  for (let m = 12; m >= 1; m--) {
    const month = addMonths(`${thisMonth}-01`, -m).slice(0, 7);
    const assets = 9690000 - m * between(95000, 125000);
    const liabilities = 2149000 + m * between(58000, 66000);
    insSnap.run(userId, month, assets, liabilities);
  }

  setSetting(db, userId, 'meta', { ...getSetting(db, userId, 'meta'), demoLoadedAt: today, onboarded: true });
}

export function clearDemo(db, userId) {
  // Order matters for foreign keys: payments reference transactions.
  for (const t of ['bill_payments', 'debt_payments', 'goal_contributions', 'transactions', 'bills', 'income_sources', 'goals', 'debts', 'accounts', 'networth_snapshots']) {
    db.prepare(`DELETE FROM ${t} WHERE user_id = ? AND is_demo = 1`).run(userId);
  }
}

export function hasDemo(db, userId) {
  const tables = ['transactions', 'accounts', 'goals', 'bills', 'debts', 'income_sources'];
  return tables.some((t) => db.prepare(`SELECT 1 FROM ${t} WHERE user_id = ? AND is_demo = 1 LIMIT 1`).get(userId));
}

export function getSetting(db, userId, key) {
  const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? JSON.parse(row.value) : (DEFAULT_SETTINGS[key] ?? null);
}
export function setSetting(db, userId, key, value) {
  db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?,?,?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value')
    .run(userId, key, JSON.stringify(value));
}
