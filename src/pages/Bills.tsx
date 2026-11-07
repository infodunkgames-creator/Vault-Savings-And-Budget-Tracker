import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, Undo2, Receipt, CalendarClock } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, CatIcon, CategoryBadge, DemoBadge, Empty, Field, MoneyInput, StatCard, Segmented } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { billOccurrences, overdueBills, type BillOccurrence } from '../lib/finance';
import { addDays, dateLabel, FREQUENCY_LABEL, isValidISODate, monthEnd, monthLabel, monthOf, monthStart, monthlyEquivalent, nextOccurrence, relativeDay } from '../lib/dates';
import { centsToInput, money, parseMoney } from '../lib/money';
import type { Bill, Frequency } from '../lib/types';

const STATUS_BADGE: Record<BillOccurrence['status'], [string, string]> = {
  paid: ['badge-green', 'Paid'], overdue: ['badge-red', 'Overdue'], 'due-soon': ['badge-yellow', 'Due soon'], upcoming: ['badge-gray', 'Upcoming'],
};

export function Bills() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [view, setView] = useState<'month' | 'upcoming' | 'all'>('month');
  const [edit, setEdit] = useState<{ bill: Bill | null } | null>(null);
  const [pay, setPay] = useState<BillOccurrence | null>(null);
  const today = state.today;
  const month = monthOf(today);
  const catById = (id: number | null) => state.categories.find((c) => c.id === id) ?? null;

  const monthOcc = useMemo(() => billOccurrences(state.bills, state.billPayments, monthStart(month), monthEnd(month), today), [state.bills, state.billPayments, month, today]);
  const overdue = useMemo(() => overdueBills(state.bills, state.billPayments, today), [state.bills, state.billPayments, today]);
  const upcoming = useMemo(() => billOccurrences(state.bills, state.billPayments, today, addDays(today, 45), today).filter((o) => !o.payment), [state.bills, state.billPayments, today]);
  const paidThisMonth = monthOcc.filter((o) => o.payment).reduce((s, o) => s + o.payment!.amount, 0);
  const unpaidThisMonth = monthOcc.filter((o) => !o.payment).reduce((s, o) => s + o.bill.amount, 0);
  const monthlyTotal = state.bills.filter((b) => b.active).reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0);

  const unmark = async (o: BillOccurrence) => {
    if (!o.payment) return;
    const hasTx = o.payment.transaction_id != null;
    if (!(await confirm({ title: `Mark ${o.bill.name} as unpaid?`, message: hasTx ? 'The payment record and the expense transaction it created will be removed.' : 'The payment record will be removed.', confirmLabel: 'Mark unpaid' }))) return;
    await run(() => api.del(`/api/bill-payments/${o.payment!.id}`), `${o.bill.name} marked unpaid`);
  };
  const del = async (b: Bill) => {
    if (!(await confirm({ title: `Delete ${b.name}?`, message: 'The bill and its payment history will be deleted. Expense transactions already recorded for past payments are kept.' }))) return;
    await run(() => api.del(`/api/bills/${b.id}`), 'Bill deleted');
  };

  const occList = view === 'month' ? [...overdue.filter((o) => monthOf(o.due) !== month), ...monthOcc] : upcoming;

  return (
    <div>
      <div className="page-head">
        <div><h2>Bills</h2><p>Track recurring bills and record payments. Bills are never marked paid automatically.</p></div>
        <button className="btn btn-primary" onClick={() => setEdit({ bill: null })}><Plus size={16} />Add bill</button>
      </div>
      <div className="grid grid-4 mb-16">
        <StatCard label="Due this month" value={money(paidThisMonth + unpaidThisMonth, { whole: true })} delta={<span className="stat-delta">{monthOcc.length} payments in {monthLabel(month)}</span>} />
        <StatCard label="Paid" value={<span className="pos">{money(paidThisMonth, { whole: true })}</span>} delta={<span className="stat-delta">{monthOcc.filter((o) => o.payment).length} of {monthOcc.length} bills</span>} />
        <StatCard label="Still to pay" value={money(unpaidThisMonth + overdue.filter((o) => monthOf(o.due) !== month).reduce((s, o) => s + o.bill.amount, 0), { whole: true })} delta={<span className="stat-delta">{overdue.length ? <span className="down">{overdue.length} overdue</span> : 'nothing overdue'}</span>} />
        <StatCard label="Avg. monthly cost" value={money(monthlyTotal, { whole: true })} delta={<span className="stat-delta">{state.bills.filter((b) => b.active).length} active bills</span>} />
      </div>

      <div className="grid grid-main">
        <Card title={view === 'month' ? `${monthLabel(month, true)} payments` : view === 'upcoming' ? 'Upcoming unpaid (45 days)' : 'All bills'}
          action={<Segmented options={['month', 'upcoming', 'all'] as const} value={view} onChange={setView} labels={{ month: 'This month', upcoming: 'Upcoming', all: 'All bills' }} />}>
          {state.bills.length === 0 ? (
            <Empty icon={Receipt} title="No bills yet" text="Add rent, utilities, subscriptions and insurance to never miss a payment." action={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ bill: null })}><Plus size={14} />Add a bill</button>} />
          ) : view === 'all' ? (
            <div className="list">
              {state.bills.map((b) => {
                const next = nextOccurrence(b.frequency, b.anchor_date, today);
                return (
                  <div key={b.id} className="list-row">
                    <CatIcon cat={catById(b.category_id)} />
                    <div className="tx-main">
                      <div className="tx-title">{b.name} <DemoBadge show={b.is_demo} /> {!b.active && <span className="badge badge-gray">Paused</span>}</div>
                      <div className="tx-meta">{FREQUENCY_LABEL[b.frequency]}{next && b.active ? ` · next ${dateLabel(next)}` : ''}</div>
                    </div>
                    <span className="hide-sm"><CategoryBadge cat={catById(b.category_id)} /></span>
                    <b className="num">{money(b.amount)}</b>
                    <button className="icon-btn sm" onClick={() => setEdit({ bill: b })} aria-label={`Edit ${b.name}`}><Pencil size={13} /></button>
                    <button className="icon-btn sm" onClick={() => del(b)} aria-label={`Delete ${b.name}`}><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>
          ) : occList.length === 0 ? <Empty icon={Check} title="All clear" text="No unpaid bills in this period." /> : (
            <div className="list">
              {occList.map((o) => {
                const [cls, label] = STATUS_BADGE[o.status];
                return (
                  <div key={`${o.bill.id}-${o.due}`} className="list-row">
                    <CatIcon cat={catById(o.bill.category_id)} />
                    <div className="tx-main">
                      <div className="tx-title">{o.bill.name} <DemoBadge show={o.bill.is_demo} /></div>
                      <div className="tx-meta">{o.payment ? `Paid ${dateLabel(o.payment.paid_date)}` : `Due ${relativeDay(o.due, today).toLowerCase()}`} · {dateLabel(o.due, { weekday: true })}</div>
                    </div>
                    <span className={`badge ${cls} hide-sm`}>{label}</span>
                    <b className="num" style={{ minWidth: 80, textAlign: 'right' }}>{money(o.payment?.amount ?? o.bill.amount)}</b>
                    {o.payment
                      ? <button className="btn btn-sm btn-ghost" onClick={() => unmark(o)}><Undo2 size={13} />Undo</button>
                      : <button className="btn btn-sm btn-primary" onClick={() => setPay(o)}><Check size={13} />Mark paid</button>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Next up" sub="Unpaid bills, soonest first">
          {upcoming.length === 0 && overdue.length === 0 ? <Empty icon={CalendarClock} title="Nothing upcoming" /> : (
            <div className="list">
              {[...overdue, ...upcoming].slice(0, 8).map((o) => (
                <div key={`n-${o.bill.id}-${o.due}`} className="list-row" style={{ padding: '9px 0' }}>
                  <div style={{ width: 44, textAlign: 'center' }}>
                    <div className="tiny muted" style={{ textTransform: 'uppercase' }}>{dateLabel(o.due).split(' ')[0]}</div>
                    <div className={`bold ${o.status === 'overdue' ? 'neg' : ''}`} style={{ fontSize: 18 }}>{Number(o.due.slice(8))}</div>
                  </div>
                  <div className="tx-main"><div className="tx-title small">{o.bill.name}</div><div className={`tx-meta ${o.status === 'overdue' ? 'neg' : ''}`}>{relativeDay(o.due, today)}</div></div>
                  <b className="num small">{money(o.bill.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <BillModal open={!!edit} bill={edit?.bill ?? null} onClose={() => setEdit(null)} />
      <PayModal occ={pay} onClose={() => setPay(null)} />
    </div>
  );
}

function BillModal({ open, bill, onClose }: { open: boolean; bill: Bill | null; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const [v, setV] = useState({ name: '', amount: '', category_id: '', account_id: '', frequency: 'monthly' as Frequency, anchor_date: state.today, notes: '', active: true });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setV(bill ? { name: bill.name, amount: centsToInput(bill.amount), category_id: bill.category_id ? String(bill.category_id) : '', account_id: bill.account_id ? String(bill.account_id) : '', frequency: bill.frequency, anchor_date: bill.anchor_date, notes: bill.notes ?? '', active: !!bill.active }
      : { name: '', amount: '', category_id: '', account_id: String(state.accounts.find((a) => a.type === 'checking')?.id ?? ''), frequency: 'monthly', anchor_date: state.today, notes: '', active: true });
  }, [open, bill, state.today, state.accounts]);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setErr((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    const e: Record<string, string> = {};
    const amount = parseMoney(v.amount);
    if (!v.name.trim()) e.name = 'Enter a name';
    if (amount == null || amount <= 0) e.amount = 'Enter an amount greater than zero';
    if (!isValidISODate(v.anchor_date)) e.anchor_date = 'Choose a valid date';
    if (Object.keys(e).length) return setErr(e);
    const body = { name: v.name.trim(), amount, category_id: v.category_id ? Number(v.category_id) : null, account_id: v.account_id ? Number(v.account_id) : null, frequency: v.frequency, anchor_date: v.anchor_date, notes: v.notes.trim() || null, active: v.active };
    try {
      if (bill) await run(() => api.put(`/api/bills/${bill.id}`, body), 'Bill updated');
      else await run(() => api.post('/api/bills', body), 'Bill added');
      onClose();
    } catch (ex) { if (ex instanceof ApiError && ex.fields) setErr(ex.fields); }
  };
  return (
    <Modal open={open} onClose={onClose} title={bill ? 'Edit bill' : 'Add a bill'}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save bill</button></>}>
      <div className="form-grid">
        <Field label="Bill name" error={err.name} full htmlFor="b-name"><input id="b-name" className={`input${err.name ? ' invalid' : ''}`} value={v.name} maxLength={60} placeholder="e.g. Rent" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Amount" error={err.amount} htmlFor="b-amount"><MoneyInput id="b-amount" value={v.amount} onChange={(x) => set('amount', x)} invalid={!!err.amount} /></Field>
        <Field label="Repeats" htmlFor="b-freq">
          <select id="b-freq" className="input" value={v.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </Field>
        <Field label={v.frequency === 'once' ? 'Due date' : 'First due date'} error={err.anchor_date} hint={v.frequency === 'once' ? undefined : 'Future due dates follow from this date'} htmlFor="b-date"><input id="b-date" type="date" className="input" value={v.anchor_date} onChange={(e) => set('anchor_date', e.target.value)} /></Field>
        <Field label="Category" htmlFor="b-cat">
          <select id="b-cat" className="input" value={v.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">Uncategorized</option>
            {state.categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </Field>
        <Field label="Paid from" htmlFor="b-acct" full>
          <select id="b-acct" className="input" value={v.account_id} onChange={(e) => set('account_id', e.target.value)}>
            <option value="">No account</option>
            {state.accounts.filter((a) => ['checking', 'savings', 'cash', 'credit_card'].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Notes (optional)" full htmlFor="b-notes"><input id="b-notes" className="input" value={v.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} /></Field>
        <label className="check field full"><input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} />Active (uncheck to pause reminders)</label>
      </div>
    </Modal>
  );
}

function PayModal({ occ, onClose }: { occ: BillOccurrence | null; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(state.today);
  const [account, setAccount] = useState('');
  const [record, setRecord] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!occ) return;
    setAmount(centsToInput(occ.bill.amount)); setDate(state.today); setAccount(occ.bill.account_id ? String(occ.bill.account_id) : ''); setRecord(true); setErr('');
  }, [occ, state.today]);
  if (!occ) return null;
  const save = async () => {
    const c = parseMoney(amount);
    if (c == null || c <= 0) return setErr('Enter the amount you paid');
    if (!isValidISODate(date)) return setErr('Choose a valid date');
    await run(() => api.post(`/api/bills/${occ.bill.id}/pay`, { due_date: occ.due, paid_date: date, amount: c, account_id: account ? Number(account) : null, record_transaction: record }), `${occ.bill.name} marked paid`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Pay ${occ.bill.name}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={15} />Confirm payment</button></>}>
      <div className="form">
        <div className="small muted">Due {dateLabel(occ.due, { weekday: true, year: true })}</div>
        <div className="form-grid">
          <Field label="Amount paid" error={err} htmlFor="p-amt"><MoneyInput id="p-amt" value={amount} onChange={(x) => { setAmount(x); setErr(''); }} invalid={!!err} /></Field>
          <Field label="Paid on" htmlFor="p-date"><input id="p-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Paid from" full htmlFor="p-acct">
            <select id="p-acct" className="input" value={account} onChange={(e) => setAccount(e.target.value)} disabled={!record}>
              <option value="">No account</option>
              {state.accounts.filter((a) => ['checking', 'savings', 'cash', 'credit_card'].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <label className="check"><input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />Also record an expense transaction (updates budgets and the account balance)</label>
      </div>
    </Modal>
  );
}
