import { describe, expect, it } from 'vitest';
import {
  amortize, billOccurrences, budgetRows, budgetSummary, carryForwardPlan, cashFlowSeries, goalStats, monthToDateComparison, netWorth,
  payoffPlan, safeToSpend, spendingByCategory, totals, buildNotifications, debtMinimumsRemaining, incomePlanVsActual, monthlyRecap,
} from './finance';
import { addMonths, monthsBetween, occurrences } from './dates';
import { money, parseMoney, pctChange } from './money';
import { mapRows, parseCSV, guessColumns, parseDateFlexible } from './csv';
import type { Account, AppState, Bill, Category, Debt, Goal, Transaction } from './types';

let id = 1;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: id++, description: 'x', amount: 1000, type: 'expense', category_id: null, account_id: null, income_source_id: null,
  date: '2026-11-03', time: null, notes: null, recurring: null, import_hash: null, is_demo: 0, created_at: '', ...p,
});
const cat = (p: Partial<Category>): Category => ({ id: id++, name: 'Cat', kind: 'expense', color: '#000000', icon: '•', budget: 0, is_default: 0, sort: 0, ...p });
const bill = (p: Partial<Bill>): Bill => ({ id: id++, name: 'Bill', amount: 10000, category_id: null, account_id: null, frequency: 'monthly', anchor_date: '2026-01-15', active: 1, notes: null, is_demo: 0, created_at: '2026-11-01 00:00:00', ...p });
const goal = (p: Partial<Goal>): Goal => ({ id: id++, name: 'G', emoji: '🎯', color: '#000000', target: 100000, target_date: null, description: null, monthly_contribution: 0, archived: 0, is_demo: 0, created_at: '', ...p });
const debt = (p: Partial<Debt>): Debt => ({ id: id++, name: 'D', type: 'credit_card', original_balance: 100000, current_balance: 100000, apr: 0, min_payment: 5000, due_day: 20, notes: null, is_demo: 0, ...p });
const acct = (p: Partial<Account>): Account => ({ id: id++, name: 'A', kind: 'asset', type: 'checking', balance: 0, verified: 1, include_in_available: 1, source: 'manual', notes: null, is_demo: 0, updated_at: '2026-11-01', ...p });

function baseState(p: Partial<AppState> = {}): AppState {
  return {
    today: '2026-11-10', hasDemo: false,
    settings: {
      profile: { name: 'T', email: '' }, preferences: { currency: 'USD', locale: 'en-US', weekStartsOn: 0, dashboardRange: '6M' },
      notifications: { bills: true, billLeadDays: 3, budgetWarning: true, budgetThreshold: 80, budgetOver: true, goalMilestones: true, monthlySummary: true }, meta: {},
    },
    categories: [], budgetOverrides: [], accounts: [], incomeSources: [], transactions: [], bills: [], billPayments: [], goals: [],
    goalContributions: [], debts: [], debtPayments: [], netWorthSnapshots: [], dismissedNotifications: [], ...p,
  };
}

describe('money', () => {
  it('parses user input to integer cents without float drift', () => {
    expect(parseMoney('$1,234.56')).toBe(123456);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('(45.00)')).toBe(-4500);
    expect(parseMoney('-3')).toBe(-300);
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });
  it('formats cents', () => {
    expect(money(123456)).toBe('$1,234.56');
    expect(money(-500)).toBe('−$5.00');
    expect(money(500, { sign: true })).toBe('+$5.00');
    expect(money(123456, { whole: true })).toBe('$1,235');
  });
  it('percent change handles zero baseline', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(5, 0)).toBeNull();
  });
});

describe('dates & recurrence', () => {
  it('clamps month-end when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('monthly occurrences keep the anchor day and clamp short months', () => {
    expect(occurrences('monthly', '2026-01-31', '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('biweekly occurrences step 14 days from the anchor', () => {
    expect(occurrences('biweekly', '2026-10-02', '2026-11-01', '2026-11-30')).toEqual(['2026-11-13', '2026-11-27']);
  });
  it('never returns dates before the anchor', () => {
    expect(occurrences('weekly', '2026-11-20', '2026-11-01', '2026-11-30')).toEqual(['2026-11-20', '2026-11-27']);
    expect(occurrences('once', '2026-11-20', '2026-11-01', '2026-11-19')).toEqual([]);
  });
  it('semimonthly and quarterly', () => {
    expect(occurrences('semimonthly', '2026-01-01', '2026-02-01', '2026-02-28')).toEqual(['2026-02-01', '2026-02-16']);
    expect(occurrences('quarterly', '2026-01-15', '2026-01-01', '2026-12-31')).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
  });
  it('monthsBetween', () => {
    expect(Math.round(monthsBetween('2026-01-01', '2027-01-01'))).toBe(12);
  });
});

describe('totals & series', () => {
  const txs = [
    tx({ type: 'income', amount: 500000, date: '2026-11-01' }),
    tx({ type: 'expense', amount: 120000, date: '2026-11-02' }),
    tx({ type: 'expense', amount: 30000, date: '2026-10-30' }),
  ];
  it('computes income, expenses, net and savings rate for a range', () => {
    const t = totals(txs, '2026-11-01', '2026-11-30');
    expect(t).toMatchObject({ income: 500000, expense: 120000, net: 380000 });
    expect(t.savingsRate).toBeCloseTo(76);
  });
  it('savings rate is 0 with no income (no divide-by-zero)', () => {
    expect(totals([tx({ amount: 100 })], '2026-11-01', '2026-11-30').savingsRate).toBe(0);
  });
  it('month-to-date comparison uses the same span of last month', () => {
    const r = monthToDateComparison([...txs, tx({ amount: 99999, date: '2026-10-20' })], '2026-11-05');
    expect(r.prev.expense).toBe(0); // Oct 30 & Oct 20 are outside Oct 1–5
    expect(r.cur.expense).toBe(120000);
  });
  it('cash flow buckets cover the range and sum correctly', () => {
    const s = cashFlowSeries(txs, '3M', '2026-11-10');
    expect(s.map((b) => b.key)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(s[2]).toMatchObject({ income: 500000, expense: 120000 });
    expect(s[1].expense).toBe(30000);
  });
  it('spending by category sums to 100%', () => {
    const a = cat({ name: 'A' });
    const b = cat({ name: 'B' });
    const s = spendingByCategory([tx({ category_id: a.id, amount: 300 }), tx({ category_id: b.id, amount: 100 }), tx({ amount: 100 })], [a, b], '2026-11-01', '2026-11-30');
    expect(s[0].name).toBe('A');
    expect(s.reduce((x, y) => x + y.pct, 0)).toBeCloseTo(100);
    expect(s.find((x) => x.name === 'Uncategorized')?.amount).toBe(100);
  });
});

describe('budgets', () => {
  const food = cat({ name: 'Food', budget: 50000 });
  const fun = cat({ name: 'Fun', budget: 10000 });
  const none = cat({ name: 'None', budget: 0 });
  const state = baseState({
    categories: [food, fun, none],
    budgetOverrides: [{ id: 1, category_id: fun.id, month: '2026-11', amount: 20000, note: null }],
    transactions: [
      tx({ category_id: food.id, amount: 42000 }), tx({ category_id: fun.id, amount: 25000 }), tx({ category_id: none.id, amount: 500 }),
      tx({ category_id: food.id, amount: 99999, date: '2026-10-01' }), tx({ type: 'income', amount: 1, category_id: null }),
    ],
  });
  const rows = budgetRows(state, '2026-11', 80);
  it('uses overrides for the month and computes remaining + level', () => {
    const f = rows.find((r) => r.category.id === food.id)!;
    expect(f).toMatchObject({ planned: 50000, spent: 42000, remaining: 8000, level: 'warning' });
    const u = rows.find((r) => r.category.id === fun.id)!;
    expect(u).toMatchObject({ planned: 20000, spent: 25000, remaining: -5000, level: 'over', overridden: true });
    expect(rows.find((r) => r.category.id === none.id)!.level).toBe('over');
  });
  it('summary totals', () => {
    const s = budgetSummary(rows, state.transactions, '2026-11');
    expect(s.planned).toBe(70000);
    expect(s.spent).toBe(67500);
  });
  it('carry forward adds unused budget only (unless overspend included)', () => {
    const plan = carryForwardPlan(rows, state.budgetOverrides, '2026-11', false);
    expect(plan.find((p) => p.category_id === food.id)).toMatchObject({ base: 50000, carry: 8000, amount: 58000 });
    expect(plan.find((p) => p.category_id === fun.id)).toBeUndefined();
    const withOver = carryForwardPlan(rows, state.budgetOverrides, '2026-11', true);
    expect(withOver.find((p) => p.category_id === fun.id)).toMatchObject({ base: 10000, carry: -5000, amount: 5000 });
  });
});

describe('bills', () => {
  it('marks occurrences paid/overdue/due-soon', () => {
    const b = bill({ anchor_date: '2026-01-05' });
    const b2 = bill({ anchor_date: '2026-01-12' });
    const b3 = bill({ anchor_date: '2026-01-25' });
    const occ = billOccurrences([b, b2, b3], [{ id: 1, bill_id: b2.id, due_date: '2026-11-12', paid_date: '2026-11-09', amount: 10000, transaction_id: null }], '2026-11-01', '2026-11-30', '2026-11-10');
    expect(occ.map((o) => o.status)).toEqual(['overdue', 'paid', 'upcoming']);
  });
});

describe('goals', () => {
  it('computes progress, required monthly and estimated completion', () => {
    const g = goal({ target: 120000, target_date: '2027-11-10', monthly_contribution: 10000 });
    const s = goalStats(g, [{ id: 1, goal_id: g.id, amount: 60000, date: '2026-01-01', note: null, account_id: null, is_demo: 0 }], '2026-11-10');
    expect(s.saved).toBe(60000);
    expect(s.remaining).toBe(60000);
    expect(s.pct).toBe(50);
    expect(s.requiredMonthly).toBe(5000); // 60000 over 12 months
    expect(s.estimatedCompletion).toBe('2027-05-10'); // 6 months at 10000
    expect(s.onTrack).toBe(true);
  });
  it('withdrawals reduce saved, and a complete goal is on track', () => {
    const g = goal({ target: 1000 });
    const c = (amount: number) => ({ id: id++, goal_id: g.id, amount, date: '2026-11-01', note: null, account_id: null, is_demo: 0 });
    expect(goalStats(g, [c(800), c(-300)], '2026-11-10').saved).toBe(500);
    expect(goalStats(g, [c(1200)], '2026-11-10')).toMatchObject({ complete: true, pct: 100, remaining: 0 });
  });
  it('without a pace there is no estimate', () => {
    const g = goal({});
    expect(goalStats(g, [], '2026-11-10').estimatedCompletion).toBeNull();
  });
});

describe('debts', () => {
  it('amortizes a zero-interest loan exactly', () => {
    expect(amortize(100000, 0, 10000)).toEqual({ months: 10, interest: 0 });
  });
  it('detects payments that never cover interest', () => {
    expect(amortize(1000000, 24, 10000).months).toBe(Infinity); // 2%/mo interest = $200 > $100 payment
  });
  it('avalanche never pays more interest than snowball', () => {
    const ds = [debt({ current_balance: 500000, apr: 6, min_payment: 10000 }), debt({ current_balance: 150000, apr: 24, min_payment: 5000 }), debt({ current_balance: 80000, apr: 12, min_payment: 3000 })];
    const s = payoffPlan(ds, 20000, 'snowball');
    const a = payoffPlan(ds, 20000, 'avalanche');
    expect(s.feasible && a.feasible).toBe(true);
    expect(a.totalInterest).toBeLessThanOrEqual(s.totalInterest);
    expect(s.order[0].name).toBe(ds[2].name); // smallest balance first
    expect(payoffPlan(ds, 0, 'avalanche').months).toBeGreaterThan(a.months);
  });
  it('principal + interest equals total paid', () => {
    const ds = [debt({ current_balance: 250000, apr: 18, min_payment: 7500 })];
    const r = payoffPlan(ds, 5000, 'avalanche');
    expect(r.totalPaid).toBe(250000 + r.totalInterest);
  });
  it('minimum remaining subtracts payments made this month', () => {
    const d = debt({ min_payment: 5000 });
    expect(debtMinimumsRemaining([d], [{ id: 1, debt_id: d.id, amount: 2000, date: '2026-11-02', note: null, transaction_id: null }], '2026-11-10')[0].remaining).toBe(3000);
  });
});

describe('net worth', () => {
  it('assets minus liabilities including tracked debts', () => {
    const r = netWorth([acct({ balance: 1000000 }), acct({ balance: 200000, verified: 0 }), acct({ kind: 'liability', type: 'credit_card', balance: 50000 })], [debt({ current_balance: 300000 })]);
    expect(r).toMatchObject({ totalAssets: 1200000, totalLiabilities: 350000, net: 850000, verifiedAssets: 1000000, estimatedAssets: 200000 });
  });
});

describe('safe to spend', () => {
  it('subtracts bills, remaining budget (without double counting bills) and savings', () => {
    const rent = cat({ name: 'Rent', budget: 150000 });
    const food = cat({ name: 'Food', budget: 60000 });
    const g = goal({ monthly_contribution: 20000 });
    const s = baseState({
      accounts: [acct({ balance: 500000 }), acct({ balance: 999999, include_in_available: 0, type: 'savings' })],
      categories: [rent, food],
      bills: [bill({ name: 'Rent', amount: 150000, category_id: rent.id, anchor_date: '2026-01-15' })],
      transactions: [tx({ category_id: food.id, amount: 10000, date: '2026-11-05' })],
      goals: [g],
      goalContributions: [{ id: 1, goal_id: g.id, amount: 5000, date: '2026-11-02', note: null, account_id: null, is_demo: 0 }],
    });
    const r = safeToSpend(s, '2026-11-10');
    expect(r.available).toBe(500000);
    expect(r.bills).toBe(150000);
    expect(r.planned).toBe(50000); // food 60000-10000; rent budget fully covered by the unpaid bill
    expect(r.savings).toBe(15000);
    expect(r.safe).toBe(500000 - 150000 - 50000 - 15000);
    expect(r.daysLeft).toBe(21);
  });
});

describe('income plan', () => {
  it('expected vs actual per source', () => {
    const src = { id: 900, name: 'Pay', type: 'paycheck', expected_amount: 200000, frequency: 'biweekly' as const, anchor_date: '2026-10-02', account_id: null, active: 1, notes: null, is_demo: 0 };
    const r = incomePlanVsActual({ incomeSources: [src], transactions: [tx({ type: 'income', amount: 200000, income_source_id: 900, date: '2026-11-13' }), tx({ type: 'income', amount: 5000 })] }, '2026-11');
    expect(r.expected).toBe(400000);
    expect(r.actual).toBe(205000);
    expect(r.unlinked).toBe(5000);
  });
});

describe('notifications & recap', () => {
  it('emits bill, budget and goal notifications and honours dismissals', () => {
    const food = cat({ name: 'Food', budget: 10000 });
    const g = goal({ target: 1000 });
    const s = baseState({
      categories: [food],
      bills: [bill({ name: 'Phone', anchor_date: '2026-01-12' })],
      transactions: [tx({ category_id: food.id, amount: 12000 }), tx({ type: 'income', amount: 1000, date: '2026-10-05' })],
      goals: [g], goalContributions: [{ id: 1, goal_id: g.id, amount: 600, date: '2026-11-01', note: null, account_id: null, is_demo: 0 }],
    });
    const n = buildNotifications(s, '2026-11-10');
    expect(n.map((x) => x.kind).sort()).toEqual(['bill', 'budget-over', 'goal']);
    expect(n.find((x) => x.kind === 'goal')!.title).toContain('50%');
    const dismissed = buildNotifications({ ...s, dismissedNotifications: n.map((x) => x.key) }, '2026-11-10');
    expect(dismissed).toHaveLength(0);
  });
  it('monthly recap reports exceeded budgets', () => {
    const food = cat({ name: 'Food', budget: 10000 });
    const r = monthlyRecap(baseState({ categories: [food], transactions: [tx({ category_id: food.id, amount: 15000, date: '2026-10-03' })] }), '2026-10');
    expect(r.exceeded.map((x) => x.category.name)).toEqual(['Food']);
    expect(r.expense).toBe(15000);
  });
});

describe('csv', () => {
  it('parses quoted fields and maps signed amounts', () => {
    const rows = parseCSV('Date,Description,Amount\n2026-11-01,"Coffee, large",-4.50\n11/02/2026,Paycheck,"2,000.00"\n');
    const map = guessColumns(rows[0]);
    const out = mapRows(rows.slice(1), map);
    expect(out[0].row).toMatchObject({ date: '2026-11-01', description: 'Coffee, large', amount: 450, type: 'expense' });
    expect(out[1].row).toMatchObject({ date: '2026-11-02', amount: 200000, type: 'income' });
  });
  it('handles debit/credit columns and rejects bad rows', () => {
    const rows = parseCSV('Posted Date,Payee,Debit,Credit\n2026-11-01,Store,12.00,\n2026-11-02,Refund,,5.00\nbad,Row,1,\n');
    const out = mapRows(rows.slice(1), guessColumns(rows[0]));
    expect(out[0].row).toMatchObject({ amount: 1200, type: 'expense' });
    expect(out[1].row).toMatchObject({ amount: 500, type: 'income' });
    expect(out[2].ok).toBe(false);
  });
  it('parses common date formats', () => {
    expect(parseDateFlexible('2/3/26')).toBe('2026-02-03');
    expect(parseDateFlexible('31.12.2026')).toBe('2026-12-31');
    expect(parseDateFlexible('2026-02-30')).toBeNull();
  });
});
