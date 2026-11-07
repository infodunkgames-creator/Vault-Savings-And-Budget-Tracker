import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Wallet, CircleDollarSign } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, DemoBadge, Empty, Field, MoneyInput, Progress, StatCard } from '../components/ui';
import { SimpleBars } from '../components/charts';
import { Modal, useConfirm } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { incomePlanVsActual } from '../lib/finance';
import { addMonthsToMonth, dateLabel, FREQUENCY_LABEL, isValidISODate, monthLabel, monthOf, nextOccurrence } from '../lib/dates';
import { centsToInput, money, parseMoney } from '../lib/money';
import type { Frequency, IncomeSource, Transaction } from '../lib/types';

const TYPES: Record<string, string> = { paycheck: 'Paycheck', freelance: 'Freelance', side_hustle: 'Side hustle', investment: 'Investments', other: 'Other income' };
const TYPE_ICON: Record<string, string> = { paycheck: '💼', freelance: '💻', side_hustle: '🚀', investment: '📈', other: '➕' };
const TYPE_TO_CAT: Record<string, string> = { paycheck: 'Paycheck', freelance: 'Freelance', side_hustle: 'Side Hustle', investment: 'Investments', other: 'Other Income' };

export function Income() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<{ src: IncomeSource | null } | null>(null);
  const [logTx, setLogTx] = useState<Transaction | null>(null);
  const month = monthOf(state.today);
  const plan = useMemo(() => incomePlanVsActual(state, month), [state, month]);
  const history = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonthsToMonth(month, i - 5)).map((m) => {
    const p = incomePlanVsActual(state, m);
    return { label: monthLabel(m), Expected: p.expected, Actual: p.actual };
  }), [state, month]);
  const monthlyAvg = plan.rows.reduce((s, r) => s + r.monthlyAverage, 0);

  const del = async (s: IncomeSource) => {
    if (!(await confirm({ title: `Delete ${s.name}?`, message: 'The income source is removed. Income transactions already recorded are kept, but are no longer linked to it.' }))) return;
    await run(() => api.del(`/api/income-sources/${s.id}`), 'Income source deleted');
  };
  const log = (s: IncomeSource) => {
    const cat = state.categories.find((c) => c.kind === 'income' && c.name === TYPE_TO_CAT[s.type]);
    // Pre-filled draft for the quick log-payment dialog.
    setLogTx({ id: 0, description: s.name, amount: s.expected_amount, type: 'income', category_id: cat?.id ?? null, account_id: s.account_id, income_source_id: s.id, date: state.today, time: null, notes: null, recurring: null, import_hash: null, is_demo: 0, created_at: '' });
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>Income</h2><p>Your income sources, what you expect from each, and what actually arrived.</p></div>
        <button className="btn btn-primary" onClick={() => setEdit({ src: null })}><Plus size={16} />Add income source</button>
      </div>
      <div className="grid grid-4 mb-16">
        <StatCard label={`Expected in ${monthLabel(month)}`} value={money(plan.expected, { whole: true })} delta={<span className="stat-delta">from scheduled sources</span>} />
        <StatCard label="Received so far" value={<span className="pos">{money(plan.actual, { whole: true })}</span>} delta={<span className="stat-delta">{plan.expected ? `${Math.round((plan.actual / plan.expected) * 100)}% of expected` : 'this month'}</span>} />
        <StatCard label="Still expected" value={money(Math.max(0, plan.expected - plan.actual), { whole: true })} delta={<span className="stat-delta">before month end</span>} />
        <StatCard label="Avg. monthly income" value={money(monthlyAvg, { whole: true })} delta={<span className="stat-delta">based on schedules</span>} />
      </div>
      <div className="grid grid-main">
        <Card title="Income sources" sub={`Planned vs actual for ${monthLabel(month, true)}`}>
          {state.incomeSources.length === 0 ? (
            <Empty icon={Wallet} title="No income sources" text="Add paychecks, freelance work or side hustles to plan expected income." action={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ src: null })}><Plus size={14} />Add a source</button>} />
          ) : (
            <div className="list">
              {plan.rows.map(({ source: s, expected, actual }) => {
                const next = s.active ? nextOccurrence(s.frequency, s.anchor_date, state.today) : null;
                return (
                  <div key={s.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="tx-icon" style={{ background: 'var(--green-dim)' }}>{TYPE_ICON[s.type] ?? '💰'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <b>{s.name}</b><DemoBadge show={s.is_demo} />{!s.active && <span className="badge badge-gray">Inactive</span>}
                        <span className="spacer" />
                        <span className="small num"><b className="pos">{money(actual)}</b> <span className="muted">of {money(expected)} expected</span></span>
                      </div>
                      <div className="tx-meta" style={{ margin: '3px 0 8px' }}>{TYPES[s.type]} · {money(s.expected_amount)} {FREQUENCY_LABEL[s.frequency].toLowerCase()}{next ? ` · next ${dateLabel(next)}` : ''}</div>
                      <Progress value={expected ? (actual / expected) * 100 : actual ? 100 : 0} color={actual >= expected ? 'var(--green)' : 'var(--blue)'} />
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => log(s)} title="Record a payment from this source"><CircleDollarSign size={13} />Log</button>
                      <button className="icon-btn sm" onClick={() => setEdit({ src: s })} aria-label={`Edit ${s.name}`}><Pencil size={13} /></button>
                      <button className="icon-btn sm" onClick={() => del(s)} aria-label={`Delete ${s.name}`}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
              {plan.unlinked > 0 && <div className="list-row small muted"><span style={{ flex: 1 }}>Other income not linked to a source</span><b className="pos num">{money(plan.unlinked)}</b></div>}
            </div>
          )}
        </Card>
        <Card title="Expected vs actual" sub="Last 6 months">
          <SimpleBars data={history} height={280} keys={[{ key: 'Expected', name: 'Expected', color: '#2F3354' }, { key: 'Actual', name: 'Actual', color: '#00D9A0' }]} />
        </Card>
      </div>
      <IncomeSourceModal open={!!edit} src={edit?.src ?? null} onClose={() => setEdit(null)} />
      {logTx && <LogPaymentModal draft={logTx} onClose={() => setLogTx(null)} />}
    </div>
  );
}

/** Quick “log a payment” confirm for an income source. */
function LogPaymentModal({ draft, onClose }: { draft: Transaction; onClose: () => void }) {
  const { run } = useData();
  const [amount, setAmount] = useState(centsToInput(draft.amount));
  const [date, setDate] = useState(draft.date);
  const [err, setErr] = useState('');
  const save = async () => {
    const c = parseMoney(amount);
    if (c == null || c <= 0) return setErr('Enter the amount received');
    if (!isValidISODate(date)) return setErr('Choose a valid date');
    await run(() => api.post('/api/transactions', { description: draft.description, amount: c, type: 'income', category_id: draft.category_id, account_id: draft.account_id, income_source_id: draft.income_source_id, date }), `${money(c)} income recorded`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Log payment · ${draft.description}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Record income</button></>}>
      <div className="form-grid">
        <Field label="Amount received" error={err} htmlFor="l-amt"><MoneyInput id="l-amt" value={amount} onChange={(x) => { setAmount(x); setErr(''); }} invalid={!!err} /></Field>
        <Field label="Date received" htmlFor="l-date"><input id="l-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function IncomeSourceModal({ open, src, onClose }: { open: boolean; src: IncomeSource | null; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const [v, setV] = useState({ name: '', type: 'paycheck', expected_amount: '', frequency: 'biweekly' as Frequency, anchor_date: state.today, account_id: '', active: true, notes: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setV(src ? { name: src.name, type: src.type, expected_amount: centsToInput(src.expected_amount), frequency: src.frequency, anchor_date: src.anchor_date, account_id: src.account_id ? String(src.account_id) : '', active: !!src.active, notes: src.notes ?? '' }
      : { name: '', type: 'paycheck', expected_amount: '', frequency: 'biweekly', anchor_date: state.today, account_id: '', active: true, notes: '' });
  }, [open, src, state.today]);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setErr((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    const e: Record<string, string> = {};
    const amt = parseMoney(v.expected_amount);
    if (!v.name.trim()) e.name = 'Enter a name';
    if (amt == null || amt <= 0) e.expected_amount = 'Enter an amount greater than zero';
    if (!isValidISODate(v.anchor_date)) e.anchor_date = 'Choose a valid date';
    if (Object.keys(e).length) return setErr(e);
    const body = { name: v.name.trim(), type: v.type, expected_amount: amt, frequency: v.frequency, anchor_date: v.anchor_date, account_id: v.account_id ? Number(v.account_id) : null, active: v.active, notes: v.notes.trim() || null };
    try {
      if (src) await run(() => api.put(`/api/income-sources/${src.id}`, body), 'Income source updated');
      else await run(() => api.post('/api/income-sources', body), 'Income source added');
      onClose();
    } catch (ex) { if (ex instanceof ApiError && ex.fields) setErr(ex.fields); }
  };
  return (
    <Modal open={open} onClose={onClose} title={src ? 'Edit income source' : 'Add income source'}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name" error={err.name} full htmlFor="i-name"><input id="i-name" className={`input${err.name ? ' invalid' : ''}`} value={v.name} maxLength={60} placeholder="e.g. Acme Corp salary" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Type" htmlFor="i-type">
          <select id="i-type" className="input" value={v.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Expected amount (each payment)" error={err.expected_amount} htmlFor="i-amt"><MoneyInput id="i-amt" value={v.expected_amount} onChange={(x) => set('expected_amount', x)} invalid={!!err.expected_amount} /></Field>
        <Field label="Schedule" htmlFor="i-freq">
          <select id="i-freq" className="input" value={v.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>{(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}</select>
        </Field>
        <Field label="A recent or upcoming pay date" error={err.anchor_date} hint="Used to project future paydays" htmlFor="i-date"><input id="i-date" type="date" className="input" value={v.anchor_date} onChange={(e) => set('anchor_date', e.target.value)} /></Field>
        <Field label="Deposited into" full htmlFor="i-acct">
          <select id="i-acct" className="input" value={v.account_id} onChange={(e) => set('account_id', e.target.value)}>
            <option value="">No account</option>
            {state.accounts.filter((a) => a.kind === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Notes (optional)" full htmlFor="i-notes"><input id="i-notes" className="input" maxLength={500} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <label className="check field full"><input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} />Active</label>
      </div>
    </Modal>
  );
}
