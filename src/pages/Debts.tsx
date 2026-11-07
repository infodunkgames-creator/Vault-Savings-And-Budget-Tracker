import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, CreditCard, Info, History, Banknote } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, DemoBadge, Empty, Field, MoneyInput, Progress, StatCard, Segmented } from '../components/ui';
import { SimpleLine } from '../components/charts';
import { Modal, useConfirm } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { amortize, debtSummary, payoffPlan, type PayoffMethod } from '../lib/finance';
import { addMonths, dateLabel, isValidISODate, monthLabelShortYear, monthOf } from '../lib/dates';
import { centsToInput, money, parseMoney } from '../lib/money';
import type { Debt } from '../lib/types';

const TYPES: Record<string, string> = { credit_card: 'Credit card', student_loan: 'Student loan', auto_loan: 'Auto loan', personal_loan: 'Personal loan', mortgage: 'Mortgage', medical: 'Medical', other: 'Other' };
const fmtMonths = (m: number) => (!Number.isFinite(m) ? 'Never at this payment' : m < 12 ? `${m} mo` : `${Math.floor(m / 12)} yr ${m % 12} mo`);

export function Debts() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<{ debt: Debt | null } | null>(null);
  const [pay, setPay] = useState<Debt | null>(null);
  const [history, setHistory] = useState<Debt | null>(null);
  const [extraInput, setExtraInput] = useState('200');
  const [method, setMethod] = useState<PayoffMethod>('avalanche');
  const extra = Math.max(0, parseMoney(extraInput) ?? 0);

  const sum = useMemo(() => debtSummary(state.debts, state.debtPayments, state.today), [state.debts, state.debtPayments, state.today]);
  const snowball = useMemo(() => payoffPlan(state.debts, extra, 'snowball'), [state.debts, extra]);
  const avalanche = useMemo(() => payoffPlan(state.debts, extra, 'avalanche'), [state.debts, extra]);
  const minimumOnly = useMemo(() => payoffPlan(state.debts, 0, 'avalanche'), [state.debts]);
  const chosen = method === 'snowball' ? snowball : avalanche;
  const maxLen = Math.max(snowball.series.length, avalanche.series.length, Math.min(minimumOnly.series.length, 600));
  const chart = Array.from({ length: Math.min(maxLen, 360) }, (_, i) => ({
    label: i % 12 === 0 ? `Yr ${i / 12}` : `M${i}`,
    Snowball: snowball.series[i]?.balance ?? 0,
    Avalanche: avalanche.series[i]?.balance ?? 0,
    'Minimums only': minimumOnly.series[i]?.balance ?? 0,
  }));
  const active = state.debts.filter((d) => d.current_balance > 0);

  const del = async (d: Debt) => {
    if (!(await confirm({ title: `Delete ${d.name}?`, message: 'The debt and its payment history are removed. Expense transactions already recorded for payments are kept.' }))) return;
    await run(() => api.del(`/api/debts/${d.id}`), 'Debt deleted');
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>Debt Tracker</h2><p>See what you owe, record payments and compare payoff strategies.</p></div>
        <button className="btn btn-primary" onClick={() => setEdit({ debt: null })}><Plus size={16} />Add debt</button>
      </div>
      <div className="grid grid-4 mb-16">
        <StatCard label="Total outstanding" value={<span className={sum.total ? 'neg' : ''}>{money(sum.total, { whole: true })}</span>} delta={<span className="stat-delta">{active.length} active debts</span>} />
        <StatCard label="Paid down" value={<span className="pos">{money(sum.paidDown, { whole: true })}</span>} delta={<span className="stat-delta">{sum.progress.toFixed(0)}% of original balances</span>} />
        <StatCard label="Monthly minimums" value={money(sum.minimums, { whole: true })} delta={<span className="stat-delta">{money(sum.paidThisMonth, { whole: true })} paid this month</span>} />
        <StatCard label="Debt-free (est.)" value={chosen.feasible ? monthLabelShortYear(monthOf(addMonths(state.today, chosen.months))) : '—'} delta={<span className="stat-delta">{method} · +{money(extra, { whole: true })}/mo extra</span>} />
      </div>

      <Card title="Your debts" className="mb-16">
        {state.debts.length === 0 ? (
          <Empty icon={CreditCard} title="No debts tracked" text="Add credit cards and loans to see payoff timelines. If you're debt-free — nice work!" action={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ debt: null })}><Plus size={14} />Add a debt</button>} />
        ) : (
          <div className="list">
            {state.debts.map((d) => {
              const progress = d.original_balance ? ((d.original_balance - d.current_balance) / d.original_balance) * 100 : 0;
              const atMin = amortize(d.current_balance, d.apr, d.min_payment);
              return (
                <div key={d.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div className="tx-icon" style={{ background: 'var(--red-dim)' }}>💳</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <b>{d.name}</b><DemoBadge show={d.is_demo} /><span className="badge badge-gray">{TYPES[d.type] ?? d.type}</span>
                      {d.current_balance === 0 && <span className="badge badge-green">Paid off 🎉</span>}
                      <span className="spacer" />
                      <span className="small num"><b>{money(d.current_balance)}</b> <span className="muted">of {money(d.original_balance, { whole: true })}</span></span>
                    </div>
                    <div className="tx-meta" style={{ margin: '3px 0 8px' }}>
                      {d.apr}% APR · min {money(d.min_payment)} due day {d.due_day}
                      {d.current_balance > 0 && <> · at minimum: {fmtMonths(atMin.months)}{Number.isFinite(atMin.interest) ? `, ${money(atMin.interest, { whole: true })} interest` : ''}</>}
                    </div>
                    <Progress value={progress} color="var(--green)" />
                    {d.current_balance > 0 && !Number.isFinite(atMin.months) && <div className="tiny neg" style={{ marginTop: 5 }}>The minimum payment doesn't cover monthly interest — this balance will grow.</div>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn btn-sm btn-primary" disabled={d.current_balance <= 0} onClick={() => setPay(d)}><Banknote size={13} />Pay</button>
                    <button className="icon-btn sm" onClick={() => setHistory(d)} aria-label={`Payment history for ${d.name}`}><History size={13} /></button>
                    <button className="icon-btn sm" onClick={() => setEdit({ debt: d })} aria-label={`Edit ${d.name}`}><Pencil size={13} /></button>
                    <button className="icon-btn sm" onClick={() => del(d)} aria-label={`Delete ${d.name}`}><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {active.length > 0 && (
        <div className="grid grid-main">
          <Card title="Payoff projection" sub="Total balance over time" action={<Segmented options={['avalanche', 'snowball'] as const} value={method} onChange={setMethod} labels={{ avalanche: 'Avalanche', snowball: 'Snowball' }} />}>
            <div className="row-wrap mb-16">
              <Field label="Extra paid toward debt each month" htmlFor="extra"><div style={{ width: 180 }}><MoneyInput id="extra" value={extraInput} onChange={setExtraInput} /></div></Field>
            </div>
            <SimpleLine data={chart} height={260} keys={[{ key: 'Avalanche', name: 'Avalanche', color: '#00D9A0' }, { key: 'Snowball', name: 'Snowball', color: '#4285F4' }, { key: 'Minimums only', name: 'Minimums only', color: '#5B5D75' }]} />
            <div className="row small muted" style={{ marginTop: 12, alignItems: 'flex-start' }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Projections are estimates. They assume fixed interest rates, no new charges, interest compounded monthly, and that you pay every minimum plus the extra amount each month. Actual results will vary.</span>
            </div>
          </Card>
          <Card title="Strategy comparison">
            <table className="table">
              <thead><tr><th /><th className="right">Avalanche</th><th className="right">Snowball</th></tr></thead>
              <tbody>
                <tr><td className="small muted">Debt-free in</td><td className="right small bold">{fmtMonths(avalanche.months)}</td><td className="right small bold">{fmtMonths(snowball.months)}</td></tr>
                <tr><td className="small muted">Total interest</td><td className="right small num">{avalanche.feasible ? money(avalanche.totalInterest, { whole: true }) : '—'}</td><td className="right small num">{snowball.feasible ? money(snowball.totalInterest, { whole: true }) : '—'}</td></tr>
                <tr><td className="small muted">vs minimums only</td><td className="right small pos num">{avalanche.feasible && minimumOnly.feasible ? `−${money(minimumOnly.totalInterest - avalanche.totalInterest, { whole: true })}` : '—'}</td><td className="right small pos num">{snowball.feasible && minimumOnly.feasible ? `−${money(minimumOnly.totalInterest - snowball.totalInterest, { whole: true })}` : '—'}</td></tr>
              </tbody>
            </table>
            <div className="divider" />
            <div className="small bold" style={{ marginBottom: 6 }}>{method === 'avalanche' ? 'Avalanche' : 'Snowball'} payoff order</div>
            <div className="tiny muted mb-16">{method === 'avalanche' ? 'Highest interest rate first — usually the least interest paid.' : 'Smallest balance first — quick wins that build momentum.'}</div>
            <div className="list">
              {chosen.order.map((o, i) => (
                <div key={o.id} className="list-row" style={{ padding: '8px 0' }}>
                  <span className="badge badge-gray">{i + 1}</span>
                  <span className="small" style={{ flex: 1 }}>{o.name}</span>
                  <span className="small muted">{Number.isFinite(o.payoffMonth) ? dateLabel(addMonths(state.today, o.payoffMonth), { year: true }) : '—'}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <DebtModal open={!!edit} debt={edit?.debt ?? null} onClose={() => setEdit(null)} />
      <DebtPayModal debt={pay} onClose={() => setPay(null)} />
      <DebtHistory debt={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function DebtModal({ open, debt, onClose }: { open: boolean; debt: Debt | null; onClose: () => void }) {
  const { run } = useData();
  const [v, setV] = useState({ name: '', type: 'credit_card', original: '', current: '', apr: '', min: '', due_day: '1', notes: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setV(debt ? { name: debt.name, type: debt.type, original: centsToInput(debt.original_balance), current: centsToInput(debt.current_balance), apr: String(debt.apr), min: centsToInput(debt.min_payment), due_day: String(debt.due_day), notes: debt.notes ?? '' }
      : { name: '', type: 'credit_card', original: '', current: '', apr: '', min: '', due_day: '1', notes: '' });
  }, [open, debt]);
  const set = (k: keyof typeof v, x: string) => { setV((s) => ({ ...s, [k]: x })); setErr((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    const e: Record<string, string> = {};
    const current = parseMoney(v.current);
    const original = v.original.trim() ? parseMoney(v.original) : current;
    const min = v.min.trim() ? parseMoney(v.min) : 0;
    const apr = v.apr.trim() ? Number(v.apr) : 0;
    const due = Number(v.due_day);
    if (!v.name.trim()) e.name = 'Enter a name';
    if (current == null || current < 0) e.current = 'Enter the current balance';
    if (original == null || original <= 0) e.original = 'Enter the original balance';
    else if (current != null && current > original) e.original = 'Original balance should be at least the current balance';
    if (!Number.isFinite(apr) || apr < 0 || apr > 100) e.apr = 'Enter a rate between 0 and 100';
    if (min == null || min < 0) e.min = 'Enter $0 or more';
    if (!Number.isInteger(due) || due < 1 || due > 31) e.due_day = 'Day 1–31';
    if (Object.keys(e).length) return setErr(e);
    const body = { name: v.name.trim(), type: v.type, original_balance: original, current_balance: current, apr, min_payment: min, due_day: due, notes: v.notes.trim() || null };
    try {
      if (debt) await run(() => api.put(`/api/debts/${debt.id}`, body), 'Debt updated');
      else await run(() => api.post('/api/debts', body), 'Debt added');
      onClose();
    } catch (ex) { if (ex instanceof ApiError && ex.fields) setErr(ex.fields); }
  };
  return (
    <Modal open={open} onClose={onClose} title={debt ? 'Edit debt' : 'Add a debt'}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save debt</button></>}>
      <div className="form-grid">
        <Field label="Name" error={err.name} htmlFor="d-name"><input id="d-name" className={`input${err.name ? ' invalid' : ''}`} value={v.name} maxLength={60} placeholder="e.g. Chase Sapphire" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Type" htmlFor="d-type"><select id="d-type" className="input" value={v.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Current balance" error={err.current} htmlFor="d-cur"><MoneyInput id="d-cur" value={v.current} onChange={(x) => set('current', x)} invalid={!!err.current} /></Field>
        <Field label="Original balance" error={err.original} hint="Used to show payoff progress" htmlFor="d-orig"><MoneyInput id="d-orig" value={v.original} onChange={(x) => set('original', x)} invalid={!!err.original} /></Field>
        <Field label="Interest rate (APR %)" error={err.apr} htmlFor="d-apr"><input id="d-apr" className={`input num${err.apr ? ' invalid' : ''}`} inputMode="decimal" value={v.apr} placeholder="e.g. 19.99" onChange={(e) => set('apr', e.target.value)} /></Field>
        <Field label="Minimum monthly payment" error={err.min} htmlFor="d-min"><MoneyInput id="d-min" value={v.min} onChange={(x) => set('min', x)} /></Field>
        <Field label="Due day of month" error={err.due_day} htmlFor="d-due"><input id="d-due" type="number" min={1} max={31} className="input" value={v.due_day} onChange={(e) => set('due_day', e.target.value)} /></Field>
        <Field label="Notes (optional)" htmlFor="d-notes"><input id="d-notes" className="input" maxLength={500} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DebtPayModal({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(state.today);
  const [account, setAccount] = useState('');
  const [record, setRecord] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!debt) return;
    setAmount(centsToInput(Math.min(debt.min_payment || debt.current_balance, debt.current_balance))); setDate(state.today); setRecord(true); setErr('');
    setAccount(String(state.accounts.find((a) => a.type === 'checking')?.id ?? ''));
  }, [debt, state.today, state.accounts]);
  if (!debt) return null;
  const save = async () => {
    const c = parseMoney(amount);
    if (c == null || c <= 0) return setErr('Enter a payment amount');
    if (c > debt.current_balance) return setErr(`Payment can't exceed the balance of ${money(debt.current_balance)}`);
    if (!isValidISODate(date)) return setErr('Choose a valid date');
    await run(() => api.post(`/api/debts/${debt.id}/payments`, { amount: c, date, account_id: record && account ? Number(account) : null, record_transaction: record }), `${money(c)} payment recorded`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Pay ${debt.name}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Record payment</button></>}>
      <div className="form">
        <div className="small muted">Balance {money(debt.current_balance)} · minimum {money(debt.min_payment)}</div>
        <div className="form-grid">
          <Field label="Amount" error={err} htmlFor="dp-amt"><MoneyInput id="dp-amt" value={amount} onChange={(x) => { setAmount(x); setErr(''); }} invalid={!!err} /></Field>
          <Field label="Date" htmlFor="dp-date"><input id="dp-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Paid from" full htmlFor="dp-acct">
            <select id="dp-acct" className="input" value={account} disabled={!record} onChange={(e) => setAccount(e.target.value)}>
              <option value="">No account</option>
              {state.accounts.filter((a) => a.kind === 'asset' && ['checking', 'savings', 'cash'].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <label className="check"><input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />Also record as an expense in “Debt Payments”</label>
      </div>
    </Modal>
  );
}

function DebtHistory({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  if (!debt) return null;
  const items = state.debtPayments.filter((p) => p.debt_id === debt.id);
  const del = async (id: number, amt: number, hasTx: boolean) => {
    if (!(await confirm({ title: 'Remove payment?', message: `${money(amt)} will be added back to the balance${hasTx ? ' and the linked expense transaction removed' : ''}.`, confirmLabel: 'Remove payment' }))) return;
    await run(() => api.del(`/api/debt-payments/${id}`), 'Payment removed');
  };
  return (
    <Modal open onClose={onClose} title={`${debt.name} — payments`}>
      {items.length === 0 ? <Empty icon={History} title="No payments recorded" text="Payments you record appear here." /> : (
        <table className="table">
          <thead><tr><th>Date</th><th className="right">Amount</th><th /></tr></thead>
          <tbody>{items.map((p) => (
            <tr key={p.id}><td className="small">{dateLabel(p.date, { year: true })}{p.note && <span className="muted"> · {p.note}</span>}</td><td className="right small bold num">{money(p.amount)}</td>
              <td className="right"><button className="icon-btn sm" onClick={() => del(p.id, p.amount, p.transaction_id != null)} aria-label="Remove payment"><Trash2 size={12} /></button></td></tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  );
}
