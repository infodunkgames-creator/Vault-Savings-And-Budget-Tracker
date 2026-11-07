import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { useAppState } from '../store/DataContext';
import { Card, Empty, Segmented, StatCard, Delta } from '../components/ui';
import { AreaSingle, DonutChart, SimpleBars, SimpleLine } from '../components/charts';
import {
  budgetRows, cashFlowSeries, monthlyRecap, monthlySeries, RANGE_LABEL, rangeStart, spendingByCategory, totals,
} from '../lib/finance';
import { addMonthsToMonth, monthLabel, monthLabelShortYear, monthOf, monthsList } from '../lib/dates';
import { money, pctChange } from '../lib/money';
import type { RangeKey } from '../lib/types';
import { topSlices } from './Dashboard';

const RANGES: RangeKey[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

export function Analytics() {
  const state = useAppState();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<RangeKey>('6M');
  const today = state.today;
  const from = rangeStart(range, today, state.transactions);
  const months = monthsList(monthOf(from), monthOf(today));
  const recapMonth = params.get('recap') ?? addMonthsToMonth(monthOf(today), -1);

  const flow = useMemo(() => cashFlowSeries(state.transactions, range, today), [state.transactions, range, today]);
  const t = useMemo(() => totals(state.transactions, from, today), [state.transactions, from, today]);
  const slices = useMemo(() => spendingByCategory(state.transactions, state.categories, from, today), [state.transactions, state.categories, from, today]);
  const monthly = useMemo(() => monthlySeries(state.transactions, months), [state.transactions, months]);
  const top = slices.slice(0, 5);
  const trend = useMemo(() => months.map((m) => {
    const row: Record<string, unknown> = { label: monthLabelShortYear(m) };
    const s = spendingByCategory(state.transactions, state.categories, `${m}-01`, `${m}-31`);
    let other = 0;
    for (const x of s) { if (top.some((tt) => tt.id === x.id)) row[x.name] = x.amount; else other += x.amount; }
    row.Other = other;
    return row;
  }), [months, state.transactions, state.categories, top]);
  const budgetPerf = useMemo(() => months.map((m) => {
    const rows = budgetRows(state, m);
    return { label: monthLabelShortYear(m), Planned: rows.reduce((s, r) => s + r.planned, 0), Actual: rows.reduce((s, r) => s + r.spent, 0) };
  }), [months, state]);
  const nwHistory = state.netWorthSnapshots.filter((s) => s.month >= monthOf(from)).map((s) => ({ label: monthLabelShortYear(s.month), 'Net worth': s.assets - s.liabilities }));
  const avgMonthlySpend = monthly.length ? Math.round(monthly.reduce((s, m) => s + m.expense, 0) / monthly.length) : 0;

  if (state.transactions.length === 0) {
    return <div><div className="page-head"><div><h2>Analytics</h2></div></div><Card><Empty icon={BarChart3} title="Nothing to analyze yet" text="Reports appear once you've recorded some income and expenses." /></Card></div>;
  }
  return (
    <div>
      <div className="page-head">
        <div><h2>Analytics</h2><p>Reports built from your recorded transactions — {RANGE_LABEL[range].toLowerCase()}.</p></div>
        <Segmented options={RANGES} value={range} onChange={setRange} labels={{ ALL: 'All time' }} />
      </div>
      <div className="grid grid-4 mb-16">
        <StatCard label="Income" value={<span className="pos">{money(t.income, { whole: true })}</span>} delta={<span className="stat-delta">{RANGE_LABEL[range]}</span>} />
        <StatCard label="Expenses" value={<span className="neg">{money(t.expense, { whole: true })}</span>} delta={<span className="stat-delta">avg {money(avgMonthlySpend, { whole: true })}/month</span>} />
        <StatCard label="Net saved" value={money(t.net, { whole: true, sign: true })} delta={<span className="stat-delta">income − expenses</span>} />
        <StatCard label="Savings rate" value={t.income ? `${t.savingsRate.toFixed(0)}%` : '—'} delta={<span className="stat-delta">of income kept</span>} />
      </div>

      <div className="grid grid-main mb-16">
        <Card title="Income vs expenses" sub={range === '1W' ? 'Daily' : range === '1M' ? 'Weekly' : 'Monthly'}>
          <SimpleBars data={flow.map((f) => ({ label: f.label, Income: f.income, Expenses: f.expense }))} height={280} keys={[{ key: 'Income', name: 'Income', color: '#00D9A0' }, { key: 'Expenses', name: 'Expenses', color: '#FF5470' }]} />
        </Card>
        <Card title="Spending by category" sub={RANGE_LABEL[range]}>
          {slices.length ? <>
            <DonutChart slices={topSlices(slices, 6)} total={t.expense} size={170} />
            <div className="list" style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto' }}>
              {slices.map((s) => (
                <div key={s.name} className="list-row" style={{ padding: '7px 0' }}>
                  <span className="legend-dot" style={{ background: s.color }} />
                  <span className="small" style={{ flex: 1 }}>{s.name} <span className="muted tiny">· {s.count}</span></span>
                  <span className="small num muted">{s.pct.toFixed(1)}%</span>
                  <b className="small num" style={{ minWidth: 76, textAlign: 'right' }}>{money(s.amount, { whole: true })}</b>
                </div>
              ))}
            </div>
          </> : <div className="muted small">No expenses in this period.</div>}
        </Card>
      </div>

      <div className="grid grid-2 mb-16">
        <Card title="Savings rate over time" sub="Monthly (income − expenses) ÷ income">
          {monthly.length > 1 ? <SimpleLine data={monthly.map((m) => ({ label: monthLabelShortYear(m.month), 'Savings rate': Number(m.savingsRate.toFixed(1)) }))} percent zeroLine height={240} keys={[{ key: 'Savings rate', name: 'Savings rate', color: '#00D9A0' }]} />
            : <div className="muted small">Choose a range of 3 months or more to see the trend.</div>}
        </Card>
        <Card title="Monthly spending trends" sub="Top categories stacked">
          {monthly.length > 1 ? <SimpleBars stacked data={trend} height={240} keys={[...top.map((s) => ({ key: s.name, name: s.name, color: s.color })), { key: 'Other', name: 'Other', color: '#3A3D5C' }]} />
            : <div className="muted small">Choose a range of 3 months or more to see the trend.</div>}
        </Card>
      </div>
      <div className="grid grid-2 mb-16">
        <Card title="Budget performance" sub="Total planned vs actual by month">
          <SimpleBars data={budgetPerf} height={240} keys={[{ key: 'Planned', name: 'Planned', color: '#2F3354' }, { key: 'Actual', name: 'Actual', color: '#4285F4' }]} />
        </Card>
        <Card title="Net worth history" sub="Monthly snapshots">
          {nwHistory.length > 1 ? <AreaSingle data={nwHistory} dataKey="Net worth" name="Net worth" height={240} color="#A78BFA" /> : <div className="muted small">Not enough history in this range yet.</div>}
        </Card>
      </div>

      <Recap month={recapMonth} setMonth={(m) => setParams({ recap: m })} />
    </div>
  );
}

function Recap({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const state = useAppState();
  const r = useMemo(() => monthlyRecap(state, month), [state, month]);
  const isFuture = month > monthOf(state.today);
  return (
    <Card title="Monthly financial recap" sub={monthLabel(month, true)}
      action={<div className="row" style={{ gap: 4 }}>
        <button className="icon-btn sm" onClick={() => setMonth(addMonthsToMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={14} /></button>
        <button className="icon-btn sm" disabled={isFuture} onClick={() => setMonth(addMonthsToMonth(month, 1))} aria-label="Next month"><ChevronRight size={14} /></button>
      </div>}>
      {r.txCount === 0 ? <div className="muted small">No transactions recorded in {monthLabel(month, true)}.</div> : (
        <div className="grid grid-2">
          <div>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="stat"><div className="stat-label">Total income</div><div className="stat-value pos" style={{ fontSize: 22 }}>{money(r.income, { whole: true })}</div><Delta value={pctChange(r.income, r.prev.income)} label="vs prior month" /></div>
              <div className="stat"><div className="stat-label">Total expenses</div><div className="stat-value neg" style={{ fontSize: 22 }}>{money(r.expense, { whole: true })}</div><Delta value={pctChange(r.expense, r.prev.expense)} goodWhenUp={false} label="vs prior month" /></div>
              <div className="stat"><div className="stat-label">Total saved</div><div className="stat-value" style={{ fontSize: 22 }}>{money(r.net, { whole: true, sign: true })}</div><span className="stat-delta">{money(r.goalSaved, { whole: true })} moved into goals</span></div>
              <div className="stat"><div className="stat-label">Savings rate</div><div className="stat-value" style={{ fontSize: 22 }}>{r.income ? `${r.savingsRate.toFixed(0)}%` : '—'}</div><Delta value={r.income && r.prev.income ? r.savingsRate - r.prev.savingsRate : null} suffix=" pts" digits={0} label="vs prior month" /></div>
            </div>
            <div className="divider" />
            <div className="small bold" style={{ marginBottom: 6 }}>Compared with your 3-month average</div>
            <div className="kv"><span>Income</span><span className="num">{money(r.income, { whole: true })} vs {money(r.avg3.income, { whole: true })} {r.income >= r.avg3.income ? <TrendingUp size={13} color="var(--green)" /> : <TrendingDown size={13} color="var(--red)" />}</span></div>
            <div className="kv"><span>Expenses</span><span className="num">{money(r.expense, { whole: true })} vs {money(r.avg3.expense, { whole: true })} {r.expense <= r.avg3.expense ? <TrendingDown size={13} color="var(--green)" /> : <TrendingUp size={13} color="var(--red)" />}</span></div>
          </div>
          <div>
            <div className="small bold" style={{ marginBottom: 8 }}>Largest spending categories</div>
            {r.topCategories.map((c) => (
              <div key={c.name} className="kv"><span><span className="legend-dot" style={{ background: c.color, display: 'inline-block', marginRight: 8 }} />{c.name}</span><span className="num">{money(c.amount, { whole: true })} · {c.pct.toFixed(0)}%</span></div>
            ))}
            <div className="divider" />
            <div className="small bold" style={{ marginBottom: 8 }}>Budgets exceeded</div>
            {r.exceeded.length === 0 ? <div className="small pos">None — every category stayed within budget. 🎉</div> : r.exceeded.map((x) => (
              <div key={x.category.id} className="kv"><span>{x.category.icon} {x.category.name}</span><span className="neg num">{money(-x.remaining, { whole: true })} over ({Math.round(x.pct)}%)</span></div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
