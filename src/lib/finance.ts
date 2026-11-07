// Pure financial calculations. Everything here is deterministic and unit-tested (finance.test.ts).
import type {
  AppState, Bill, BillPayment, BudgetOverride, Category, Cents, Debt, DebtPayment, Goal, GoalContribution, ISODate,
  Month, RangeKey, Transaction, Account,
} from './types';
import {
  addDays, addMonths, addMonthsToMonth, dateLabel, daysInMonth, diffDays, monthEnd, monthLabel, monthOf, monthStart,
  monthsBetween, monthsList, occurrences, pad, monthlyEquivalent,
} from './dates';

// ---------------------------------------------------------------------------------------------
// Transactions & cash flow
// ---------------------------------------------------------------------------------------------
export function inRange(t: { date: ISODate }, from: ISODate, to: ISODate) {
  return t.date >= from && t.date <= to;
}
export function totals(txs: Transaction[], from: ISODate, to: ISODate) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (!inRange(t, from, to)) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  const net = income - expense;
  return { income, expense, net, savingsRate: income > 0 ? (net / income) * 100 : 0 };
}

export interface MonthTotals { month: Month; label: string; income: Cents; expense: Cents; net: Cents; savingsRate: number }
export function monthlySeries(txs: Transaction[], months: Month[]): MonthTotals[] {
  const map = new Map<Month, { income: number; expense: number }>(months.map((m) => [m, { income: 0, expense: 0 }]));
  for (const t of txs) {
    const b = map.get(monthOf(t.date));
    if (!b) continue;
    if (t.type === 'income') b.income += t.amount;
    else b.expense += t.amount;
  }
  return months.map((m) => {
    const { income, expense } = map.get(m)!;
    return { month: m, label: monthLabel(m), income, expense, net: income - expense, savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0 };
  });
}

export const RANGE_LABEL: Record<RangeKey, string> = { '1W': '1 week', '1M': '1 month', '3M': '3 months', '6M': '6 months', '1Y': '1 year', ALL: 'All time' };

/** Start date for a range ending today. 'ALL' starts at the first transaction. */
export function rangeStart(range: RangeKey, today: ISODate, txs: Transaction[]): ISODate {
  switch (range) {
    case '1W': return addDays(today, -6);
    case '1M': return addDays(addMonths(today, -1), 1);
    case '3M': return monthStart(addMonthsToMonth(monthOf(today), -2));
    case '6M': return monthStart(addMonthsToMonth(monthOf(today), -5));
    case '1Y': return monthStart(addMonthsToMonth(monthOf(today), -11));
    case 'ALL': {
      const first = txs.reduce<ISODate | null>((min, t) => (!min || t.date < min ? t.date : min), null);
      return first ? monthStart(monthOf(first)) : monthStart(monthOf(today));
    }
  }
}

export interface FlowPoint { key: string; label: string; from: ISODate; to: ISODate; income: Cents; expense: Cents; net: Cents }
/** Income vs expense buckets: daily for 1W, weekly for 1M, monthly otherwise. */
export function cashFlowSeries(txs: Transaction[], range: RangeKey, today: ISODate): FlowPoint[] {
  const start = rangeStart(range, today, txs);
  const buckets: FlowPoint[] = [];
  if (range === '1W') {
    for (let d = start; d <= today; d = addDays(d, 1)) buckets.push({ key: d, label: dateLabel(d), from: d, to: d, income: 0, expense: 0, net: 0 });
  } else if (range === '1M') {
    for (let d = start; d <= today; d = addDays(d, 7)) {
      const to = addDays(d, 6) > today ? today : addDays(d, 6);
      buckets.push({ key: d, label: dateLabel(d), from: d, to, income: 0, expense: 0, net: 0 });
    }
  } else {
    for (const m of monthsList(monthOf(start), monthOf(today))) {
      buckets.push({ key: m, label: range === 'ALL' || range === '1Y' ? `${monthLabel(m)} ’${m.slice(2, 4)}` : monthLabel(m), from: monthStart(m), to: monthEnd(m) > today ? today : monthEnd(m), income: 0, expense: 0, net: 0 });
    }
  }
  for (const t of txs) {
    if (t.date < start || t.date > today) continue;
    const b = buckets.find((x) => t.date >= x.from && t.date <= x.to);
    if (!b) continue;
    if (t.type === 'income') b.income += t.amount;
    else b.expense += t.amount;
  }
  buckets.forEach((b) => { b.net = b.income - b.expense; });
  return buckets;
}

export interface CategorySlice { id: number | null; name: string; color: string; icon: string; amount: Cents; pct: number; count: number }
export function spendingByCategory(txs: Transaction[], cats: Category[], from: ISODate, to: ISODate, type: 'expense' | 'income' = 'expense'): CategorySlice[] {
  const byId = new Map<number | null, CategorySlice>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type || !inRange(t, from, to)) continue;
    total += t.amount;
    const key = t.category_id;
    let s = byId.get(key);
    if (!s) {
      const c = cats.find((x) => x.id === key);
      s = { id: key, name: c?.name ?? 'Uncategorized', color: c?.color ?? '#5B5D75', icon: c?.icon ?? '❔', amount: 0, pct: 0, count: 0 };
      byId.set(key, s);
    }
    s.amount += t.amount;
    s.count++;
  }
  const out = [...byId.values()].sort((a, b) => b.amount - a.amount);
  out.forEach((s) => { s.pct = total ? (s.amount / total) * 100 : 0; });
  return out;
}

/** Month-to-date vs. the same span of the previous month (fair comparison mid-month). */
export function monthToDateComparison(txs: Transaction[], today: ISODate) {
  const m = monthOf(today);
  const cur = totals(txs, monthStart(m), today);
  const pm = addMonthsToMonth(m, -1);
  const [py, pmo] = pm.split('-').map(Number);
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(py, pmo));
  const isLastDay = Number(today.slice(8, 10)) === daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
  const prevTo = isLastDay ? monthEnd(pm) : `${pm}-${pad(day)}`;
  const prev = totals(txs, monthStart(pm), prevTo);
  return { cur, prev, prevLabel: `${monthLabel(pm)} 1–${Number(prevTo.slice(8, 10))}`, curLabel: `${monthLabel(m)} 1–${Number(today.slice(8, 10))}` };
}

// ---------------------------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------------------------
export function plannedFor(cat: Category, overrides: BudgetOverride[], month: Month): Cents {
  return overrides.find((o) => o.category_id === cat.id && o.month === month)?.amount ?? cat.budget;
}
export type BudgetLevel = 'none' | 'ok' | 'warning' | 'over';
export interface BudgetRow {
  category: Category; planned: Cents; spent: Cents; remaining: Cents; pct: number; level: BudgetLevel; overridden: boolean; note: string | null;
}
export function budgetRows(state: Pick<AppState, 'categories' | 'budgetOverrides' | 'transactions'>, month: Month, warnAt = 80): BudgetRow[] {
  const from = monthStart(month);
  const to = monthEnd(month);
  const spentBy = new Map<number, number>();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || t.category_id == null || !inRange(t, from, to)) continue;
    spentBy.set(t.category_id, (spentBy.get(t.category_id) ?? 0) + t.amount);
  }
  return state.categories.filter((c) => c.kind === 'expense').map((c) => {
    const ov = state.budgetOverrides.find((o) => o.category_id === c.id && o.month === month);
    const planned = ov?.amount ?? c.budget;
    const spent = spentBy.get(c.id) ?? 0;
    const pctSpent = planned > 0 ? (spent / planned) * 100 : spent > 0 ? Infinity : 0;
    let level: BudgetLevel = 'ok';
    if (planned === 0) level = spent > 0 ? 'over' : 'none';
    else if (spent > planned) level = 'over';
    else if (pctSpent >= warnAt) level = 'warning';
    return { category: c, planned, spent, remaining: planned - spent, pct: pctSpent, level, overridden: Boolean(ov), note: ov?.note ?? null };
  });
}
export function budgetSummary(rows: BudgetRow[], txs: Transaction[], month: Month) {
  const planned = rows.reduce((s, r) => s + r.planned, 0);
  const spentBudgeted = rows.reduce((s, r) => s + r.spent, 0);
  const uncategorized = txs.filter((t) => t.type === 'expense' && t.category_id == null && monthOf(t.date) === month).reduce((s, t) => s + t.amount, 0);
  const spent = spentBudgeted + uncategorized;
  return {
    planned, spent, uncategorized, remaining: planned - spent,
    pct: planned ? (spent / planned) * 100 : 0,
    over: rows.filter((r) => r.level === 'over' && r.planned > 0),
    warning: rows.filter((r) => r.level === 'warning'),
  };
}
/** Next month's budgets with this month's unused amount (and optionally overspend) rolled in. */
export function carryForwardPlan(rows: BudgetRow[], overrides: BudgetOverride[], fromMonth: Month, includeOverspend: boolean) {
  const next = addMonthsToMonth(fromMonth, 1);
  return rows
    .filter((r) => r.planned > 0 || r.spent > 0)
    .map((r) => {
      const base = plannedFor(r.category, overrides, next);
      const carry = includeOverspend ? r.remaining : Math.max(0, r.remaining);
      return { category_id: r.category.id, name: r.category.name, base, carry, amount: Math.max(0, base + carry) };
    })
    .filter((x) => x.carry !== 0);
}

// ---------------------------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------------------------
export interface BillOccurrence { bill: Bill; due: ISODate; payment: BillPayment | null; status: 'paid' | 'overdue' | 'due-soon' | 'upcoming' }
export function billOccurrences(bills: Bill[], payments: BillPayment[], from: ISODate, to: ISODate, today: ISODate, soonDays = 7): BillOccurrence[] {
  const out: BillOccurrence[] = [];
  for (const bill of bills) {
    if (!bill.active) continue;
    for (const due of occurrences(bill.frequency, bill.anchor_date, from, to)) {
      const payment = payments.find((p) => p.bill_id === bill.id && p.due_date === due) ?? null;
      const n = diffDays(today, due);
      const status = payment ? 'paid' : n < 0 ? 'overdue' : n <= soonDays ? 'due-soon' : 'upcoming';
      out.push({ bill, due, payment, status });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.bill.name.localeCompare(b.bill.name));
}
/**
 * Unpaid occurrences from the last 60 days that are now overdue. Occurrences dated before the bill
 * was added to Vault are ignored — entering a bill with a past first due date shouldn't flag history.
 */
export function overdueBills(bills: Bill[], payments: BillPayment[], today: ISODate) {
  return billOccurrences(bills, payments, addDays(today, -60), addDays(today, -1), today)
    .filter((o) => o.status === 'overdue' && (!o.bill.created_at || o.due >= o.bill.created_at.slice(0, 10)));
}

// ---------------------------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------------------------
export function incomePlanVsActual(state: Pick<AppState, 'incomeSources' | 'transactions'>, month: Month) {
  const from = monthStart(month);
  const to = monthEnd(month);
  const rows = state.incomeSources.map((s) => {
    const expected = s.active ? occurrences(s.frequency, s.anchor_date, from, to).length * s.expected_amount : 0;
    const actual = state.transactions.filter((t) => t.type === 'income' && t.income_source_id === s.id && inRange(t, from, to)).reduce((a, t) => a + t.amount, 0);
    return { source: s, expected, actual, diff: actual - expected, monthlyAverage: s.active ? monthlyEquivalent(s.expected_amount, s.frequency) : 0 };
  });
  const unlinked = state.transactions.filter((t) => t.type === 'income' && t.income_source_id == null && inRange(t, from, to)).reduce((a, t) => a + t.amount, 0);
  const expected = rows.reduce((a, r) => a + r.expected, 0);
  const actual = rows.reduce((a, r) => a + r.actual, 0) + unlinked;
  return { rows, unlinked, expected, actual };
}

// ---------------------------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------------------------
export interface GoalStats {
  saved: Cents; remaining: Cents; pct: number; requiredMonthly: Cents | null; monthsLeft: number | null;
  pace: Cents; estimatedCompletion: ISODate | null; onTrack: boolean | null; complete: boolean; contributedThisMonth: Cents;
}
export function goalStats(goal: Goal, contributions: GoalContribution[], today: ISODate): GoalStats {
  const mine = contributions.filter((c) => c.goal_id === goal.id);
  const saved = Math.max(0, mine.reduce((s, c) => s + c.amount, 0));
  const remaining = Math.max(0, goal.target - saved);
  const complete = saved >= goal.target;
  const pctDone = Math.min(100, (saved / goal.target) * 100);
  const month = monthOf(today);
  const contributedThisMonth = mine.filter((c) => monthOf(c.date) === month).reduce((s, c) => s + c.amount, 0);

  let monthsLeft: number | null = null;
  let requiredMonthly: Cents | null = null;
  if (goal.target_date && !complete) {
    monthsLeft = Math.max(0, monthsBetween(today, goal.target_date));
    requiredMonthly = monthsLeft <= 0 ? remaining : Math.ceil(remaining / Math.max(1, Math.ceil(monthsLeft)));
  }
  // Pace: the planned monthly contribution, or the average net contribution of the last 3 full months.
  let pace = goal.monthly_contribution;
  if (!pace) {
    const since = monthStart(addMonthsToMonth(month, -3));
    const before = monthStart(month);
    const sum = mine.filter((c) => c.date >= since && c.date < before).reduce((s, c) => s + c.amount, 0);
    pace = Math.max(0, Math.round(sum / 3));
  }
  let estimatedCompletion: ISODate | null = null;
  if (complete) estimatedCompletion = mine.reduce<ISODate | null>((max, c) => (!max || c.date > max ? c.date : max), null);
  else if (pace > 0) estimatedCompletion = addMonths(today, Math.ceil(remaining / pace));
  const onTrack = complete ? true : goal.target_date && estimatedCompletion ? estimatedCompletion <= goal.target_date : goal.target_date ? false : null;
  return { saved, remaining, pct: pctDone, requiredMonthly, monthsLeft, pace, estimatedCompletion, onTrack, complete, contributedThisMonth };
}
export const GOAL_MILESTONES = [25, 50, 75, 100];

// ---------------------------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------------------------
export function monthlyInterest(balance: Cents, apr: number) {
  return Math.round(balance * (apr / 100 / 12));
}
/** Months and interest to pay off a single debt at a fixed payment. months = Infinity if it never pays off. */
export function amortize(balance: Cents, apr: number, payment: Cents) {
  let b = balance;
  let months = 0;
  let interest = 0;
  while (b > 0 && months < 1200) {
    const i = monthlyInterest(b, apr);
    if (payment <= i) return { months: Infinity, interest: Infinity };
    interest += i;
    b = b + i - payment;
    months++;
  }
  return { months, interest };
}

export type PayoffMethod = 'snowball' | 'avalanche';
export interface PayoffResult {
  method: PayoffMethod; months: number; totalInterest: Cents; totalPaid: Cents; feasible: boolean;
  order: { id: number; name: string; payoffMonth: number; interest: Cents }[];
  series: { month: number; balance: Cents }[];
}
/**
 * Simulate paying all debts with minimums + `extra` per month. When a debt is cleared its minimum
 * rolls into the next target. Snowball targets the smallest balance; avalanche the highest APR.
 */
export function payoffPlan(debts: Debt[], extra: Cents, method: PayoffMethod, maxMonths = 600): PayoffResult {
  const ds = debts.filter((d) => d.current_balance > 0).map((d) => ({ ...d, bal: d.current_balance, interest: 0, paidOff: 0 }));
  const budget = ds.reduce((s, d) => s + d.min_payment, 0) + extra;
  const series = [{ month: 0, balance: ds.reduce((s, d) => s + d.bal, 0) }];
  let month = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  const sortTargets = () => [...ds].filter((d) => d.bal > 0).sort((a, b) => (method === 'snowball' ? a.bal - b.bal || b.apr - a.apr : b.apr - a.apr || a.bal - b.bal));
  while (ds.some((d) => d.bal > 0) && month < maxMonths) {
    month++;
    for (const d of ds) {
      if (d.bal <= 0) continue;
      const i = monthlyInterest(d.bal, d.apr);
      d.bal += i;
      d.interest += i;
      totalInterest += i;
    }
    let pool = budget;
    for (const d of ds) {
      if (d.bal <= 0) continue;
      const pay = Math.min(d.min_payment, d.bal, pool);
      d.bal -= pay;
      pool -= pay;
      totalPaid += pay;
    }
    for (const d of sortTargets()) {
      if (pool <= 0) break;
      const pay = Math.min(d.bal, pool);
      d.bal -= pay;
      pool -= pay;
      totalPaid += pay;
    }
    for (const d of ds) if (d.bal <= 0 && !d.paidOff) d.paidOff = month;
    series.push({ month, balance: ds.reduce((s, d) => s + Math.max(0, d.bal), 0) });
  }
  const feasible = ds.every((d) => d.bal <= 0);
  return {
    method, months: feasible ? month : Infinity, totalInterest, totalPaid, feasible,
    order: ds.map((d) => ({ id: d.id, name: d.name, payoffMonth: d.paidOff || Infinity, interest: d.interest })).sort((a, b) => a.payoffMonth - b.payoffMonth),
    series,
  };
}
export function debtSummary(debts: Debt[], payments: DebtPayment[], today: ISODate) {
  const total = debts.reduce((s, d) => s + d.current_balance, 0);
  const original = debts.reduce((s, d) => s + d.original_balance, 0);
  const minimums = debts.filter((d) => d.current_balance > 0).reduce((s, d) => s + Math.min(d.min_payment, d.current_balance), 0);
  const month = monthOf(today);
  const paidThisMonth = payments.filter((p) => monthOf(p.date) === month).reduce((s, p) => s + p.amount, 0);
  return { total, original, paidDown: original - total, progress: original ? ((original - total) / original) * 100 : 0, minimums, paidThisMonth };
}
/** Minimum payment still owed this month for each debt (minimum minus payments already made this month). */
export function debtMinimumsRemaining(debts: Debt[], payments: DebtPayment[], today: ISODate) {
  const month = monthOf(today);
  return debts.filter((d) => d.current_balance > 0 && d.min_payment > 0).map((d) => {
    const paid = payments.filter((p) => p.debt_id === d.id && monthOf(p.date) === month).reduce((s, p) => s + p.amount, 0);
    const [y, m] = month.split('-').map(Number);
    const due = `${month}-${pad(Math.min(d.due_day, daysInMonth(y, m)))}`;
    return { debt: d, due, remaining: Math.max(0, Math.min(d.min_payment, d.current_balance) - paid) };
  }).filter((x) => x.remaining > 0);
}

// ---------------------------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------------------------
export function netWorth(accounts: Account[], debts: Debt[]) {
  const assets = accounts.filter((a) => a.kind === 'asset');
  const liabs = accounts.filter((a) => a.kind === 'liability');
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabs.reduce((s, a) => s + a.balance, 0) + debts.reduce((s, d) => s + d.current_balance, 0);
  const verifiedAssets = assets.filter((a) => a.verified).reduce((s, a) => s + a.balance, 0);
  return { totalAssets, totalLiabilities, net: totalAssets - totalLiabilities, verifiedAssets, estimatedAssets: totalAssets - verifiedAssets };
}

// ---------------------------------------------------------------------------------------------
// Safe-to-spend
// ---------------------------------------------------------------------------------------------
export interface SafeLine { label: string; amount: Cents; detail?: string }
export interface SafeToSpend {
  available: Cents; availableLines: SafeLine[];
  bills: Cents; billLines: SafeLine[];
  planned: Cents; plannedLines: SafeLine[];
  savings: Cents; savingsLines: SafeLine[];
  safe: Cents; perDay: Cents; daysLeft: number; periodEnd: ISODate;
}
/**
 * Safe to spend (through the end of this month) =
 *   available cash − unpaid bills & debt minimums − remaining planned (budgeted) spending − committed savings.
 * Remaining planned spending for a category excludes unpaid bills already counted, so nothing is double counted.
 */
export function safeToSpend(state: AppState, today: ISODate): SafeToSpend {
  const month = monthOf(today);
  const end = monthEnd(month);
  const availableLines = state.accounts.filter((a) => a.kind === 'asset' && a.include_in_available).map((a) => ({ label: a.name, amount: a.balance, detail: a.verified ? 'Verified' : 'Estimate' }));

  const unpaidBills = [
    ...overdueBills(state.bills, state.billPayments, today),
    ...billOccurrences(state.bills, state.billPayments, today, end, today).filter((o) => !o.payment),
  ];
  const debtMins = debtMinimumsRemaining(state.debts, state.debtPayments, today);
  const billLines: SafeLine[] = [
    ...unpaidBills.map((o) => ({ label: o.bill.name, amount: o.bill.amount, detail: `${o.status === 'overdue' ? 'Overdue · ' : ''}due ${dateLabel(o.due)}` })),
    ...debtMins.map((d) => ({ label: `${d.debt.name} (minimum)`, amount: d.remaining, detail: `due ${dateLabel(d.due)}` })),
  ];

  // Unpaid bill amounts per category this month (avoid double counting with the budget).
  const billByCat = new Map<number, number>();
  for (const o of unpaidBills) if (o.bill.category_id != null && monthOf(o.due) === month) billByCat.set(o.bill.category_id, (billByCat.get(o.bill.category_id) ?? 0) + o.bill.amount);
  const debtCat = state.categories.find((c) => c.kind === 'expense' && c.name === 'Debt Payments');
  if (debtCat) billByCat.set(debtCat.id, (billByCat.get(debtCat.id) ?? 0) + debtMins.reduce((s, d) => s + d.remaining, 0));
  const plannedLines: SafeLine[] = budgetRows(state, month)
    .map((r) => ({ label: r.category.name, amount: Math.max(0, r.remaining - (billByCat.get(r.category.id) ?? 0)), detail: `${moneyLite(r.spent)} of ${moneyLite(r.planned)} used` }))
    .filter((l) => l.amount > 0);

  const savingsLines: SafeLine[] = state.goals.filter((g) => !g.archived && g.monthly_contribution > 0).map((g) => {
    const s = goalStats(g, state.goalContributions, today);
    const owed = s.complete ? 0 : Math.min(s.remaining, Math.max(0, g.monthly_contribution - Math.max(0, s.contributedThisMonth)));
    return { label: `${g.emoji} ${g.name}`, amount: owed, detail: `${moneyLite(Math.max(0, s.contributedThisMonth))} of ${moneyLite(g.monthly_contribution)} contributed` };
  }).filter((l) => l.amount > 0);

  const sum = (ls: SafeLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const available = sum(availableLines);
  const bills = sum(billLines);
  const planned = sum(plannedLines);
  const savings = sum(savingsLines);
  const safe = available - bills - planned - savings;
  const daysLeft = diffDays(today, end) + 1;
  return { available, availableLines, bills, billLines, planned, plannedLines, savings, savingsLines, safe, perDay: Math.max(0, Math.floor(safe / daysLeft)), daysLeft, periodEnd: end };
}
const moneyLite = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// ---------------------------------------------------------------------------------------------
// Monthly recap
// ---------------------------------------------------------------------------------------------
export function monthlyRecap(state: AppState, month: Month) {
  const from = monthStart(month);
  const to = monthEnd(month);
  const t = totals(state.transactions, from, to);
  const prevMonth = addMonthsToMonth(month, -1);
  const prev = totals(state.transactions, monthStart(prevMonth), monthEnd(prevMonth));
  const last3 = [1, 2, 3].map((n) => addMonthsToMonth(month, -n)).map((m) => totals(state.transactions, monthStart(m), monthEnd(m)));
  const avg3 = {
    income: Math.round(last3.reduce((s, x) => s + x.income, 0) / 3),
    expense: Math.round(last3.reduce((s, x) => s + x.expense, 0) / 3),
  };
  const rows = budgetRows(state, month);
  const goalSaved = state.goalContributions.filter((c) => monthOf(c.date) === month).reduce((s, c) => s + c.amount, 0);
  return {
    month, ...t, goalSaved,
    prev, avg3,
    topCategories: spendingByCategory(state.transactions, state.categories, from, to).slice(0, 5),
    exceeded: rows.filter((r) => r.level === 'over' && r.planned > 0),
    txCount: state.transactions.filter((x) => inRange(x, from, to)).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------------------------
export interface AppNotification {
  key: string; kind: 'bill' | 'budget-warning' | 'budget-over' | 'goal' | 'summary';
  title: string; body: string; severity: 'info' | 'warning' | 'danger' | 'success'; date: ISODate; link: string;
}
export function buildNotifications(state: AppState, today: ISODate): AppNotification[] {
  const prefs = state.settings.notifications;
  const out: AppNotification[] = [];
  const month = monthOf(today);
  if (prefs.bills) {
    for (const o of overdueBills(state.bills, state.billPayments, today)) {
      out.push({ key: `bill:${o.bill.id}:${o.due}`, kind: 'bill', severity: 'danger', date: o.due, link: '/bills', title: `${o.bill.name} is overdue`, body: `${moneyLite(o.bill.amount)} was due ${dateLabel(o.due)}.` });
    }
    for (const o of billOccurrences(state.bills, state.billPayments, today, addDays(today, prefs.billLeadDays), today)) {
      if (o.payment) continue;
      const n = diffDays(today, o.due);
      out.push({ key: `bill:${o.bill.id}:${o.due}`, kind: 'bill', severity: 'warning', date: o.due, link: '/bills', title: `${o.bill.name} due ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`, body: `${moneyLite(o.bill.amount)} due ${dateLabel(o.due)}.` });
    }
  }
  if (prefs.budgetWarning || prefs.budgetOver) {
    for (const r of budgetRows(state, month, prefs.budgetThreshold)) {
      if (r.planned <= 0) continue;
      if (r.level === 'over' && prefs.budgetOver) {
        out.push({ key: `budget-over:${r.category.id}:${month}`, kind: 'budget-over', severity: 'danger', date: today, link: '/budgets', title: `Over budget: ${r.category.name}`, body: `${moneyLite(r.spent)} spent of ${moneyLite(r.planned)} (${moneyLite(-r.remaining)} over).` });
      } else if (r.level === 'warning' && prefs.budgetWarning) {
        out.push({ key: `budget-warn:${r.category.id}:${month}`, kind: 'budget-warning', severity: 'warning', date: today, link: '/budgets', title: `${r.category.name} at ${Math.round(r.pct)}% of budget`, body: `${moneyLite(r.remaining)} left for ${monthLabel(month, true)}.` });
      }
    }
  }
  if (prefs.goalMilestones) {
    for (const g of state.goals.filter((x) => !x.archived)) {
      const s = goalStats(g, state.goalContributions, today);
      const hit = [...GOAL_MILESTONES].reverse().find((m) => s.pct >= m);
      if (hit) out.push({ key: `goal:${g.id}:${hit}`, kind: 'goal', severity: 'success', date: today, link: '/goals', title: hit === 100 ? `${g.emoji} ${g.name} fully funded!` : `${g.emoji} ${g.name} is ${hit}% funded`, body: `${moneyLite(s.saved)} saved of ${moneyLite(g.target)}.` });
    }
  }
  if (prefs.monthlySummary && Number(today.slice(8, 10)) <= 7 && state.transactions.length) {
    const pm = addMonthsToMonth(month, -1);
    const r = monthlyRecap(state, pm);
    if (r.txCount) out.push({ key: `summary:${pm}`, kind: 'summary', severity: 'info', date: monthStart(month), link: `/analytics?recap=${pm}`, title: `${monthLabel(pm, true)} recap is ready`, body: `Income ${moneyLite(r.income)}, spent ${moneyLite(r.expense)}, savings rate ${Math.round(r.savingsRate)}%.` });
  }
  const dismissed = new Set(state.dismissedNotifications);
  return out.filter((n) => !dismissed.has(n.key));
}

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------
export interface CalendarEvent { date: ISODate; kind: 'bill' | 'income' | 'savings' | 'recurring' | 'debt'; title: string; amount: Cents; done: boolean; link: string }
export function calendarEvents(state: AppState, from: ISODate, to: ISODate, today: ISODate): CalendarEvent[] {
  const ev: CalendarEvent[] = [];
  for (const o of billOccurrences(state.bills, state.billPayments, from, to, today)) {
    ev.push({ date: o.due, kind: 'bill', title: o.bill.name, amount: o.payment?.amount ?? o.bill.amount, done: Boolean(o.payment), link: '/bills' });
  }
  for (const s of state.incomeSources.filter((x) => x.active)) {
    for (const d of occurrences(s.frequency, s.anchor_date, from, to)) {
      const received = state.transactions.some((t) => t.type === 'income' && t.income_source_id === s.id && Math.abs(diffDays(t.date, d)) <= 3);
      ev.push({ date: d, kind: 'income', title: s.name, amount: s.expected_amount, done: received, link: '/income' });
    }
  }
  for (const g of state.goals.filter((x) => !x.archived && x.monthly_contribution > 0)) {
    for (const m of monthsList(monthOf(from), monthOf(to))) {
      const d = `${m}-01`;
      if (d < from || d > to) continue;
      const contributed = state.goalContributions.some((c) => c.goal_id === g.id && monthOf(c.date) === m && c.amount > 0);
      ev.push({ date: d, kind: 'savings', title: `${g.emoji} ${g.name}`, amount: g.monthly_contribution, done: contributed, link: '/goals' });
    }
  }
  for (const d of state.debts.filter((x) => x.current_balance > 0 && x.min_payment > 0)) {
    for (const m of monthsList(monthOf(from), monthOf(to))) {
      const [y, mo] = m.split('-').map(Number);
      const date = `${m}-${pad(Math.min(d.due_day, daysInMonth(y, mo)))}`;
      if (date < from || date > to) continue;
      const paid = state.debtPayments.some((p) => p.debt_id === d.id && monthOf(p.date) === m);
      ev.push({ date, kind: 'debt', title: `${d.name} minimum`, amount: d.min_payment, done: paid, link: '/debts' });
    }
  }
  // Recurring transactions that are not already represented by a bill or an income source: project forward.
  const billNames = new Set(state.bills.map((b) => b.name.toLowerCase()));
  const latest = new Map<string, Transaction>();
  for (const t of state.transactions) {
    if (!t.recurring || t.income_source_id != null || billNames.has(t.description.toLowerCase())) continue;
    const k = `${t.description.toLowerCase()}|${t.type}`;
    const cur = latest.get(k);
    if (!cur || t.date > cur.date) latest.set(k, t);
  }
  for (const t of latest.values()) {
    for (const d of occurrences(t.recurring!, t.date, from, to)) {
      if (d <= t.date || d < today) continue; // only project future occurrences; past ones are real transactions
      ev.push({ date: d, kind: 'recurring', title: t.description, amount: t.type === 'income' ? t.amount : -t.amount, done: false, link: '/transactions' });
    }
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}
