import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RotateCcw, CornerDownRight, AlertTriangle, PieChart, Tag } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, ColorPicker, EmojiPicker, Empty, Field, MoneyInput, Progress, StatCard } from '../components/ui';
import { SimpleBars } from '../components/charts';
import { Modal, useConfirm } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { budgetRows, budgetSummary, carryForwardPlan, type BudgetRow } from '../lib/finance';
import { addMonthsToMonth, monthLabel, monthOf } from '../lib/dates';
import { centsToInput, money, parseMoney } from '../lib/money';
import type { Category, Month, TxType } from '../lib/types';

const LEVEL_COLOR = { none: 'var(--faint)', ok: 'var(--green)', warning: 'var(--yellow)', over: 'var(--red)' };
const CAT_EMOJI = ['🛒', '⛽', '🏠', '💡', '🎬', '🛍️', '🔁', '💆', '💳', '📦', '🍔', '✈️', '🐶', '🎓', '🏥', '🎁', '💼', '💻', '📈', '➕'];

export function Budgets() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [month, setMonth] = useState<Month>(monthOf(state.today));
  const [editRow, setEditRow] = useState<BudgetRow | null>(null);
  const [catModal, setCatModal] = useState<{ cat: Category | null; kind: TxType } | null>(null);
  const [carryOpen, setCarryOpen] = useState(false);
  const threshold = state.settings.notifications.budgetThreshold;

  const rows = useMemo(() => budgetRows(state, month, threshold), [state, month, threshold]);
  const sum = useMemo(() => budgetSummary(rows, state.transactions, month), [rows, state.transactions, month]);
  const isCurrent = month === monthOf(state.today);
  const hasOverrides = state.budgetOverrides.some((o) => o.month === month);
  const chartData = rows.filter((r) => r.planned > 0 || r.spent > 0).map((r) => ({ label: r.category.name.split(' ')[0], Planned: r.planned, Actual: r.spent }));

  const deleteCategory = async (c: Category) => {
    const used = state.transactions.filter((t) => t.category_id === c.id).length;
    if (!(await confirm({ title: `Delete “${c.name}”?`, message: used ? `${used} transactions use this category. They'll become Uncategorized (your amounts are kept). This also removes any budgets set for it.` : 'This category and its budgets will be removed.' }))) return;
    await run(() => api.del(`/api/categories/${c.id}`), 'Category deleted');
  };
  const resetMonth = async () => {
    if (!(await confirm({ title: `Reset ${monthLabel(month, true)} budgets?`, message: 'Every category returns to its default monthly budget for this month. Carried-forward amounts and one-off adjustments are removed.', confirmLabel: 'Reset budgets', danger: true }))) return;
    await run(() => api.post('/api/budgets/reset', { month }), 'Budgets reset to defaults');
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>Budgets</h2><p>Plan monthly spending by category and track it against what you actually spend.</p></div>
        <div className="row-wrap">
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" onClick={() => setMonth(addMonthsToMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <div className="bold" style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel(month, true)}</div>
            <button className="icon-btn" onClick={() => setMonth(addMonthsToMonth(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
          {!isCurrent && <button className="btn btn-sm btn-ghost" onClick={() => setMonth(monthOf(state.today))}>This month</button>}
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard label="Planned" value={money(sum.planned, { whole: true })} delta={<span className="stat-delta">{rows.filter((r) => r.planned > 0).length} budgeted categories</span>} />
        <StatCard label="Spent" value={money(sum.spent, { whole: true })} delta={<span className="stat-delta">{sum.pct.toFixed(0)}% of plan{sum.uncategorized ? ` · ${money(sum.uncategorized, { whole: true })} uncategorized` : ''}</span>} />
        <StatCard label={sum.remaining >= 0 ? 'Remaining' : 'Over budget'} value={<span className={sum.remaining >= 0 ? '' : 'neg'}>{money(Math.abs(sum.remaining), { whole: true })}</span>} delta={<span className="stat-delta">{isCurrent ? 'left to spend this month' : 'for the month'}</span>} />
        <StatCard label="Alerts" value={<span>{sum.over.length + sum.warning.length}</span>} delta={<span className="stat-delta"><span className="down">{sum.over.length} over</span> · <span style={{ color: 'var(--yellow)' }}>{sum.warning.length} near limit</span></span>} />
      </div>

      <div className="grid grid-main">
        <Card title="Categories" sub={`Warning at ${threshold}% of budget · change in Preferences`}
          action={<div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setCarryOpen(true)} title="Roll unused budget into next month"><CornerDownRight size={13} />Carry forward</button>
            {hasOverrides && <button className="btn btn-sm" onClick={resetMonth}><RotateCcw size={13} />Reset month</button>}
            <button className="btn btn-sm btn-primary" onClick={() => setCatModal({ cat: null, kind: 'expense' })}><Plus size={13} />Category</button>
          </div>}>
          <div className="mb-16">
            <div className="row small" style={{ marginBottom: 6 }}><span className="muted">Total</span><span className="spacer" /><b className="num">{money(sum.spent, { whole: true })}</b><span className="muted num">/ {money(sum.planned, { whole: true })}</span></div>
            <Progress lg value={sum.pct} color={sum.pct > 100 ? 'var(--red)' : sum.pct >= threshold ? 'var(--yellow)' : 'var(--green)'} />
          </div>
          {rows.length === 0 ? <Empty icon={PieChart} title="No expense categories" text="Create a category to start budgeting." /> : (
            <div className="list">
              {rows.map((r) => (
                <div key={r.category.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div className="tx-icon" style={{ background: `${r.category.color}1a` }}>{r.category.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <Link to={`/transactions?category=${r.category.id}&month=${month}`} className="bold">{r.category.name}</Link>
                      {r.level === 'over' && r.planned > 0 && <span className="badge badge-red"><AlertTriangle size={10} />Over by {money(-r.remaining, { whole: true })}</span>}
                      {r.level === 'over' && r.planned === 0 && <span className="badge badge-yellow">Unbudgeted spending</span>}
                      {r.level === 'warning' && <span className="badge badge-yellow">{Math.round(r.pct)}% used</span>}
                      {r.overridden && <span className="badge badge-blue" title={r.note ?? 'Adjusted for this month'}>Adjusted</span>}
                      <span className="spacer" />
                      <span className="small num"><b>{money(r.spent)}</b> <span className="muted">of {money(r.planned, { whole: true })}</span></span>
                    </div>
                    <div style={{ margin: '8px 0 5px' }}><Progress value={r.planned ? r.pct : r.spent ? 100 : 0} color={LEVEL_COLOR[r.level]} /></div>
                    <div className="row tiny muted">
                      <span>{r.planned ? `${Math.min(999, Math.round(r.pct))}% spent` : 'No budget set'}</span>
                      <span className="spacer" />
                      <span className={r.remaining < 0 ? 'neg' : ''}>{r.remaining >= 0 ? `${money(r.remaining)} left` : `${money(-r.remaining)} over`}</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn sm" onClick={() => setEditRow(r)} aria-label={`Edit budget for ${r.category.name}`} title="Edit budget"><Pencil size={13} /></button>
                    <button className="icon-btn sm" onClick={() => setCatModal({ cat: r.category, kind: 'expense' })} aria-label={`Edit category ${r.category.name}`} title="Edit category"><Tag size={13} /></button>
                    <button className="icon-btn sm" onClick={() => deleteCategory(r.category)} aria-label={`Delete ${r.category.name}`} title="Delete category"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Planned vs actual" sub={monthLabel(month, true)}>
            {chartData.length ? <SimpleBars data={chartData} height={280} keys={[{ key: 'Planned', name: 'Planned', color: '#2F3354' }, { key: 'Actual', name: 'Actual', color: '#00D9A0' }]} /> : <div className="muted small">No budget data for this month.</div>}
          </Card>
          <Card title="Income categories" sub="Used to classify money coming in" action={<button className="card-link" onClick={() => setCatModal({ cat: null, kind: 'income' })}>+ Add</button>}>
            <div className="list">
              {state.categories.filter((c) => c.kind === 'income').map((c) => (
                <div key={c.id} className="list-row" style={{ padding: '7px 0' }}>
                  <div className="tx-icon" style={{ width: 30, height: 30, background: `${c.color}1a`, fontSize: 14 }}>{c.icon}</div>
                  <span style={{ flex: 1 }} className="small">{c.name}</span>
                  <button className="icon-btn sm" onClick={() => setCatModal({ cat: c, kind: 'income' })} aria-label={`Edit ${c.name}`}><Pencil size={12} /></button>
                  <button className="icon-btn sm" onClick={() => deleteCategory(c)} aria-label={`Delete ${c.name}`}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <BudgetEditModal row={editRow} month={month} onClose={() => setEditRow(null)} />
      <CategoryModal state={catModal} onClose={() => setCatModal(null)} />
      <CarryForwardModal open={carryOpen} onClose={() => setCarryOpen(false)} rows={rows} month={month} />
    </div>
  );
}

function BudgetEditModal({ row, month, onClose }: { row: BudgetRow | null; month: Month; onClose: () => void }) {
  const { run } = useData();
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<'default' | 'month'>('default');
  const [err, setErr] = useState('');
  const [last, setLast] = useState<number | null>(null);
  if (row && row.category.id !== last) {
    setLast(row.category.id);
    setAmount(centsToInput(row.planned));
    setScope(row.overridden ? 'month' : 'default');
    setErr('');
  }
  const close = () => { setLast(null); onClose(); };
  const save = async () => {
    if (!row) return;
    const cents = parseMoney(amount);
    if (cents == null || cents < 0) return setErr('Enter a budget of $0 or more');
    if (scope === 'default') {
      await run(async () => {
        await api.put(`/api/categories/${row.category.id}`, { budget: cents });
        if (row.overridden) await api.del('/api/budgets/override', { category_id: row.category.id, month });
      }, `${row.category.name} budget updated`);
    } else {
      await run(() => api.put('/api/budgets/override', { category_id: row.category.id, month, amount: cents, note: 'Adjusted for this month' }), `${row.category.name} budget set for ${monthLabel(month, true)}`);
    }
    close();
  };
  return (
    <Modal open={!!row} onClose={close} title={`Budget · ${row?.category.name ?? ''}`}
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Save budget</button></>}>
      <div className="form">
        <Field label="Monthly budget" error={err} htmlFor="b-amt"><MoneyInput id="b-amt" value={amount} onChange={(v) => { setAmount(v); setErr(''); }} invalid={!!err} /></Field>
        <div className="field">
          <span className="label">Apply to</span>
          <label className="check"><input type="radio" checked={scope === 'default'} onChange={() => setScope('default')} />Every month (default budget)</label>
          <label className="check"><input type="radio" checked={scope === 'month'} onChange={() => setScope('month')} />Only {monthLabel(month, true)}</label>
        </div>
        {row && <div className="small muted">Spent so far in {monthLabel(month, true)}: <b style={{ color: 'var(--text)' }}>{money(row.spent)}</b></div>}
      </div>
    </Modal>
  );
}

function CategoryModal({ state: s, onClose }: { state: { cat: Category | null; kind: TxType } | null; onClose: () => void }) {
  const { run } = useData();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#00D9A0');
  const [budget, setBudget] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  const k = s ? `${s.cat?.id ?? 'new'}-${s.kind}` : null;
  if (k !== key) {
    setKey(k);
    setName(s?.cat?.name ?? '');
    setIcon(s?.cat?.icon ?? (s?.kind === 'income' ? '💰' : '📦'));
    setColor(s?.cat?.color ?? '#00D9A0');
    setBudget(s?.cat ? centsToInput(s.cat.budget) : '');
    setErr({});
  }
  const save = async () => {
    if (!s) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter a name';
    const b = budget.trim() ? parseMoney(budget) : 0;
    if (s.kind === 'expense' && (b == null || b < 0)) e.budget = 'Enter $0 or more';
    if (Object.keys(e).length) return setErr(e);
    const body = { name: name.trim(), icon, color, kind: s.kind, budget: s.kind === 'expense' ? b : 0 };
    try {
      if (s.cat) await run(() => api.put(`/api/categories/${s.cat!.id}`, body), 'Category saved');
      else await run(() => api.post('/api/categories', body), 'Category created');
      onClose();
    } catch (ex) { if (ex instanceof ApiError && ex.fields) setErr(ex.fields); }
  };
  return (
    <Modal open={!!s} onClose={onClose} title={s?.cat ? 'Edit category' : `New ${s?.kind ?? ''} category`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="form">
        <Field label="Name" error={err.name} htmlFor="c-name"><input id="c-name" className={`input${err.name ? ' invalid' : ''}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
        {s?.kind === 'expense' && <Field label="Default monthly budget" error={err.budget} hint="Use $0 to track without a limit" htmlFor="c-bud"><MoneyInput id="c-bud" value={budget} onChange={setBudget} /></Field>}
        <div className="field"><span className="label">Icon</span><EmojiPicker value={icon} onChange={setIcon} options={CAT_EMOJI} /></div>
        <div className="field"><span className="label">Color</span><ColorPicker value={color} onChange={setColor} /></div>
      </div>
    </Modal>
  );
}

function CarryForwardModal({ open, onClose, rows, month }: { open: boolean; onClose: () => void; rows: BudgetRow[]; month: Month }) {
  const state = useAppState();
  const { run } = useData();
  const [includeOver, setIncludeOver] = useState(false);
  const plan = carryForwardPlan(rows, state.budgetOverrides, month, includeOver);
  const next = addMonthsToMonth(month, 1);
  const apply = async () => {
    await run(() => api.post('/api/budgets/batch', { month: next, items: plan.map((p) => ({ category_id: p.category_id, amount: p.amount, note: `Carried forward from ${monthLabel(month, true)}` })) }), `Budgets carried into ${monthLabel(next, true)}`);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={`Carry forward into ${monthLabel(next, true)}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!plan.length} onClick={apply}>Apply to {monthLabel(next)}</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>Unused budget from {monthLabel(month, true)} is added to next month's budget for each category. You can undo this any time with “Reset month”.</p>
      <label className="check mb-16"><input type="checkbox" checked={includeOver} onChange={(e) => setIncludeOver(e.target.checked)} />Also subtract overspending from next month</label>
      {plan.length === 0 ? <div className="muted small">Nothing to carry forward.</div> : (
        <table className="table">
          <thead><tr><th>Category</th><th className="right">Base</th><th className="right">Carry</th><th className="right">New budget</th></tr></thead>
          <tbody>{plan.map((p) => (
            <tr key={p.category_id}><td className="small">{p.name}</td><td className="right small num">{money(p.base)}</td><td className={`right small num ${p.carry < 0 ? 'neg' : 'pos'}`}>{money(p.carry, { sign: true })}</td><td className="right small bold num">{money(p.amount)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  );
}
