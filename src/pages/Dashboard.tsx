import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Receipt, PiggyBank, ArrowLeftRight, Info, ShieldCheck, Plus } from 'lucide-react';
import { useAppState } from '../store/DataContext';
import { TopbarSlot } from '../components/Layout';
import { Card, CatIcon, CategoryBadge, Delta, DemoBadge, Empty, Progress, Segmented, StatCard } from '../components/ui';
import { CashFlowChart, DonutChart } from '../components/charts';
import { Modal } from '../components/Modal';
import {
  billOccurrences, cashFlowSeries, goalStats, monthToDateComparison, netWorth, overdueBills, RANGE_LABEL, safeToSpend, spendingByCategory,
  type CategorySlice, type SafeToSpend,
} from '../lib/finance';
import { addDays, addMonthsToMonth, dateLabel, monthLabel, monthOf, monthStart, relativeDay, time12 } from '../lib/dates';
import { money, pctChange } from '../lib/money';
import type { RangeKey } from '../lib/types';
import { GoalModal } from './Goals';

const RANGES: RangeKey[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];
const RANGE_KEY = 'vault.dashboardRange';
function loadRange(): RangeKey {
  try { const v = localStorage.getItem(RANGE_KEY) as RangeKey | null; return v && RANGES.includes(v) ? v : '6M'; } catch { return '6M'; }
}

export function topSlices(slices: CategorySlice[], n: number): CategorySlice[] {
  if (slices.length <= n + 1) return slices;
  const top = slices.slice(0, n);
  const rest = slices.slice(n);
  const amount = rest.reduce((s, x) => s + x.amount, 0);
  return [...top, { id: -1, name: `Other (${rest.length})`, color: '#5B5D75', icon: '…', amount, pct: rest.reduce((s, x) => s + x.pct, 0), count: rest.reduce((s, x) => s + x.count, 0) }];
}

export function Dashboard() {
  const state = useAppState();
  const nav = useNavigate();
  const [range, setRangeState] = useState<RangeKey>(loadRange);
  const [safeOpen, setSafeOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const setRange = (r: RangeKey) => { setRangeState(r); try { localStorage.setItem(RANGE_KEY, r); } catch { /* ignore */ } };
  const today = state.today;
  const month = monthOf(today);

  const nw = useMemo(() => netWorth(state.accounts, state.debts), [state.accounts, state.debts]);
  const prevSnap = state.netWorthSnapshots.find((s) => s.month === addMonthsToMonth(month, -1));
  const nwChange = prevSnap ? pctChange(nw.net, prevSnap.assets - prevSnap.liabilities) : null;
  const mtd = useMemo(() => monthToDateComparison(state.transactions, today), [state.transactions, today]);
  const flow = useMemo(() => cashFlowSeries(state.transactions, range, today), [state.transactions, range, today]);
  const slices = useMemo(() => spendingByCategory(state.transactions, state.categories, monthStart(month), today), [state.transactions, state.categories, month, today]);
  const safe = useMemo(() => safeToSpend(state, today), [state, today]);
  const upcoming = useMemo(() => [
    ...overdueBills(state.bills, state.billPayments, today),
    ...billOccurrences(state.bills, state.billPayments, today, addDays(today, 21), today).filter((o) => !o.payment),
  ].slice(0, 5), [state.bills, state.billPayments, today]);
  const recent = state.transactions.slice(0, 5);
  const goals = state.goals.filter((g) => !g.archived).slice(0, 4);
  const catById = (id: number | null) => state.categories.find((c) => c.id === id) ?? null;
  const flowTotals = flow.reduce((a, b) => ({ income: a.income + b.income, expense: a.expense + b.expense }), { income: 0, expense: 0 });

  return (
    <div className="stack">
      <TopbarSlot><Segmented options={RANGES} value={range} onChange={setRange} labels={{ ALL: 'All' }} /></TopbarSlot>

      <div className="grid grid-4">
        <StatCard accent label="Net worth" value={money(nw.net, { whole: true })} title="Assets minus liabilities (including tracked debts)"
          delta={<Delta value={nwChange} label="vs last month" />} />
        <StatCard label="Monthly income" value={money(mtd.cur.income, { whole: true })} title={`${mtd.curLabel} compared with ${mtd.prevLabel}`}
          delta={<Delta value={pctChange(mtd.cur.income, mtd.prev.income)} label={`vs ${mtd.prevLabel}`} />} />
        <StatCard label="Total expenses" value={money(mtd.cur.expense, { whole: true })} title={`${mtd.curLabel} compared with ${mtd.prevLabel}`}
          delta={<Delta value={pctChange(mtd.cur.expense, mtd.prev.expense)} goodWhenUp={false} label={`vs ${mtd.prevLabel}`} />} />
        <StatCard label="Savings rate" value={mtd.cur.income ? `${Math.round(mtd.cur.savingsRate)}%` : '—'} title="(Income − expenses) ÷ income, month to date"
          delta={<Delta value={mtd.cur.income && mtd.prev.income ? mtd.cur.savingsRate - mtd.prev.savingsRate : null} suffix=" pts" label="vs last month" digits={0} />} />
      </div>

      <div className="grid grid-main">
        <Card title="Cash Flow Overview" sub={`Income vs expenses — ${RANGE_LABEL[range].toLowerCase()}`}
          action={<div className="chart-legend"><span><i style={{ background: 'var(--green)' }} />Income</span><span><i style={{ background: 'var(--red)' }} />Expenses</span></div>}>
          <div className="mobile-only" style={{ marginBottom: 10 }}><Segmented options={RANGES} value={range} onChange={setRange} labels={{ ALL: 'All' }} /></div>
          {state.transactions.length ? (
            <>
              <CashFlowChart data={flow} height={250} />
              <div className="row-wrap small" style={{ marginTop: 10, gap: 18 }}>
                <span className="muted">Income <b className="pos num">{money(flowTotals.income, { whole: true })}</b></span>
                <span className="muted">Expenses <b className="neg num">{money(flowTotals.expense, { whole: true })}</b></span>
                <span className="muted">Net <b className={`num ${flowTotals.income - flowTotals.expense >= 0 ? 'pos' : 'neg'}`}>{money(flowTotals.income - flowTotals.expense, { whole: true, sign: true })}</b></span>
              </div>
            </>
          ) : <Empty icon={ArrowLeftRight} title="No transactions yet" text="Add income and expenses to see your cash flow over time." />}
        </Card>

        <Card title="Spending" sub={`By category, ${monthLabel(month, true)}`}>
          {slices.length ? (
            <>
              <DonutChart slices={topSlices(slices, 5)} total={mtd.cur.expense} />
              <div className="list" style={{ marginTop: 14 }}>
                {topSlices(slices, 5).map((s) => (
                  <Link key={s.name} to={s.id && s.id > 0 ? `/transactions?category=${s.id}&month=${month}` : `/transactions?month=${month}`} className="list-row" style={{ padding: '8px 0' }}>
                    <span className="legend-dot" style={{ background: s.color }} />
                    <span style={{ flex: 1 }} className="small">{s.name}</span>
                    <span className="small bold num">{s.pct.toFixed(0)}% · {money(s.amount, { whole: true })}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : <Empty icon={Receipt} title="No spending this month" text="Expenses you record will be grouped by category here." />}
        </Card>
      </div>

      <div className="grid grid-main">
        <Card className="safe-hero" title={<span className="row"><ShieldCheck size={18} color="var(--green)" />Safe to spend</span>}
          sub={`Through ${dateLabel(safe.periodEnd)} · ${safe.daysLeft} day${safe.daysLeft === 1 ? '' : 's'} left`}
          action={<button className="card-link" onClick={() => setSafeOpen(true)}>See calculation →</button>}>
          <div className="row-wrap" style={{ alignItems: 'flex-end', gap: 24 }}>
            <div>
              <div className={`safe-amount num ${safe.safe < 0 ? 'neg' : ''}`}>{money(safe.safe, { whole: true })}</div>
              <div className="muted small">{safe.safe > 0 ? <>About <b style={{ color: 'var(--text)' }}>{money(safe.perDay, { whole: true })}/day</b> for the rest of the month</> : 'Your commitments exceed available cash — review the breakdown.'}</div>
            </div>
            <div className="spacer" />
            <SafeMini safe={safe} />
          </div>
          <SafeAllocation safe={safe} />
          {safe.availableLines.length === 0 && (
            <div className="small muted mt-16 row"><Info size={14} />Mark a checking or cash account as “available to spend” on the <Link to="/net-worth" className="card-link">Net Worth</Link> page.</div>
          )}
        </Card>

        <Card title="Upcoming bills" sub="Next 3 weeks" action={<Link to="/bills" className="card-link">All bills →</Link>}>
          {upcoming.length ? (
            <div className="list">
              {upcoming.map((o) => (
                <div key={`${o.bill.id}-${o.due}`} className="list-row" style={{ padding: '9px 0' }}>
                  <CatIcon cat={catById(o.bill.category_id)} size={32} />
                  <div className="tx-main">
                    <div className="tx-title small">{o.bill.name}</div>
                    <div className={`tx-meta ${o.status === 'overdue' ? 'neg' : ''}`}>{o.status === 'overdue' ? 'Overdue · ' : ''}{relativeDay(o.due, today)}</div>
                  </div>
                  <span className="bold num small">{money(o.bill.amount)}</span>
                </div>
              ))}
            </div>
          ) : <Empty icon={Receipt} title="Nothing due soon" text="Unpaid bills due in the next 3 weeks show up here." />}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Recent Transactions" sub={`Last ${recent.length} operations`} action={<Link to="/transactions" className="card-link">View all →</Link>}>
          {recent.length ? (
            <div className="list">
              {recent.map((t) => (
                <div key={t.id} className="list-row">
                  <CatIcon cat={catById(t.category_id)} income={t.type === 'income'} />
                  <div className="tx-main">
                    <div className="tx-title">{t.description} <DemoBadge show={t.is_demo} /></div>
                    <div className="tx-meta">{relativeDay(t.date, today)}{t.time ? ` · ${time12(t.time)}` : ''}</div>
                  </div>
                  <span className="hide-sm"><CategoryBadge cat={catById(t.category_id)} /></span>
                  <span className={`tx-amount num ${t.type === 'income' ? 'pos' : 'neg'}`}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</span>
                </div>
              ))}
            </div>
          ) : <Empty icon={ArrowLeftRight} title="No transactions yet" text="Use the Add button to record your first income or expense." />}
        </Card>

        <Card title="Savings Goals" sub={`${goals.length} active goal${goals.length === 1 ? '' : 's'}`} action={<button className="card-link" onClick={() => setGoalOpen(true)}>+ Add goal</button>}>
          {goals.length ? (
            <div className="stack" style={{ gap: 18 }}>
              {goals.map((g) => {
                const s = goalStats(g, state.goalContributions, today);
                return (
                  <button key={g.id} onClick={() => nav('/goals')} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                    <div className="row" style={{ marginBottom: 7 }}>
                      <span className="bold">{g.emoji} {g.name}</span>
                      <span className="spacer" />
                      <span className="small num"><span style={{ color: g.color }}>{money(s.saved, { whole: true })}</span> <span className="muted">/ {money(g.target, { whole: true })}</span></span>
                    </div>
                    <Progress value={s.pct} color={g.color} />
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {Math.floor(s.pct)}% complete{s.estimatedCompletion && !s.complete ? ` · Est. ${dateLabel(s.estimatedCompletion, { year: true })}` : s.complete ? ' · Funded 🎉' : ' · Add contributions to estimate'}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : <Empty icon={PiggyBank} title="No savings goals" text="Create a goal to track progress toward something that matters." action={<button className="btn btn-primary btn-sm" onClick={() => setGoalOpen(true)}><Plus size={14} />New goal</button>} />}
        </Card>
      </div>

      <Modal open={safeOpen} onClose={() => setSafeOpen(false)} title="How safe-to-spend is calculated" wide>
        <SafeBreakdown safe={safe} />
      </Modal>
      <GoalModal open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  );
}

function SafeAllocation({ safe }: { safe: SafeToSpend }) {
  if (safe.available <= 0) return null;
  const parts = [
    { label: 'Bills & minimums', v: safe.bills, c: 'var(--red)' },
    { label: 'Planned spending', v: safe.planned, c: 'var(--yellow)' },
    { label: 'Savings', v: safe.savings, c: 'var(--blue)' },
    { label: 'Safe to spend', v: Math.max(0, safe.safe), c: 'var(--green)' },
  ];
  const total = Math.max(safe.available, parts.reduce((s, p) => s + p.v, 0));
  return (
    <div className="mt-16">
      <div className="small muted" style={{ marginBottom: 8 }}>Where your available {money(safe.available, { whole: true })} is committed</div>
      <div className="alloc" role="img" aria-label="Allocation of available money">
        {parts.filter((p) => p.v > 0).map((p) => <span key={p.label} title={`${p.label}: ${money(p.v)}`} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />)}
      </div>
      <div className="chart-legend" style={{ marginTop: 10 }}>
        {parts.map((p) => <span key={p.label}><i style={{ background: p.c }} />{p.label} · {Math.round((p.v / total) * 100)}%</span>)}
      </div>
    </div>
  );
}

function SafeMini({ safe }: { safe: SafeToSpend }) {
  const rows = [
    ['Available', safe.available, 'var(--text)'],
    ['Bills & minimums', -safe.bills, 'var(--red)'],
    ['Planned spending', -safe.planned, 'var(--yellow)'],
    ['Savings commitments', -safe.savings, 'var(--blue)'],
  ] as const;
  return (
    <div style={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}>
      {rows.map(([l, v, c]) => (
        <div key={l} className="kv" style={{ padding: '4px 0' }}><span>{l}</span><b className="num" style={{ color: c }}>{money(v, { whole: true, sign: v < 0 })}</b></div>
      ))}
    </div>
  );
}

export function SafeBreakdown({ safe }: { safe: SafeToSpend }) {
  const groups = [
    { title: 'Available money', sign: 1, total: safe.available, lines: safe.availableLines, color: 'var(--green)', note: 'Accounts marked “available to spend” (checking, cash).' },
    { title: 'Upcoming bills & debt minimums', sign: -1, total: safe.bills, lines: safe.billLines, color: 'var(--red)', note: 'Unpaid bills due by month end (plus any overdue) and remaining debt minimum payments.' },
    { title: 'Remaining planned spending', sign: -1, total: safe.planned, lines: safe.plannedLines, color: 'var(--yellow)', note: 'Unused budget per category, excluding bills already counted above.' },
    { title: 'Committed savings contributions', sign: -1, total: safe.savings, lines: safe.savingsLines, color: 'var(--blue)', note: 'Monthly goal contributions not yet made this month.' },
  ];
  return (
    <div>
      <p className="muted small" style={{ marginTop: 0 }}>Safe to spend = available money − upcoming bills − remaining planned expenses − committed savings. Expand a group to see every amount included.</p>
      {groups.map((g) => (
        <details key={g.title} className="breakdown-group">
          <summary>
            <span className="legend-dot" style={{ background: g.color }} />
            <span style={{ flex: 1 }}>{g.title} <span className="muted tiny">({g.lines.length})</span></span>
            <b className="num">{money(g.sign * g.total, { sign: g.sign < 0 && g.total > 0 })}</b>
          </summary>
          <div className="tiny muted" style={{ padding: '8px 14px 0' }}>{g.note}</div>
          {g.lines.length === 0 && <div className="kv muted"><span>Nothing included</span></div>}
          {g.lines.map((l, i) => (
            <div key={i} className="kv"><span>{l.label}{l.detail && <span className="tiny" style={{ color: 'var(--faint)' }}> · {l.detail}</span>}</span><span className="num">{money(l.amount)}</span></div>
          ))}
        </details>
      ))}
      <div className="divider" />
      <div className="row"><b style={{ flex: 1 }}>Safe to spend</b><b className={`num ${safe.safe < 0 ? 'neg' : 'pos'}`} style={{ fontSize: 18 }}>{money(safe.safe)}</b></div>
      <div className="muted tiny" style={{ marginTop: 4 }}>That's about {money(safe.perDay)} per day over the next {safe.daysLeft} days. This is a planning estimate based on the balances and budgets you've entered.</div>
    </div>
  );
}
