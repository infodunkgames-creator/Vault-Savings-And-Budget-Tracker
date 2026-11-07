import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, ShieldCheck, CircleDashed, Landmark } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, Delta, DemoBadge, Empty, Field, MoneyInput, StatCard } from '../components/ui';
import { AreaSingle } from '../components/charts';
import { Modal, useConfirm } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { netWorth } from '../lib/finance';
import { addMonthsToMonth, monthLabelShortYear, monthOf, relativeDay } from '../lib/dates';
import { centsToInput, money, parseMoney, pctChange } from '../lib/money';
import type { Account } from '../lib/types';

export const ASSET_TYPES: Record<string, [string, string]> = {
  checking: ['Checking', '🏦'], savings: ['Savings', '💰'], cash: ['Cash', '💵'], investment: ['Investments', '📈'],
  retirement: ['Retirement', '🏖️'], vehicle: ['Vehicle', '🚗'], property: ['Property', '🏠'], other_asset: ['Other asset', '📦'],
};
export const LIABILITY_TYPES: Record<string, [string, string]> = {
  credit_card: ['Credit card', '💳'], student_loan: ['Student loan', '🎓'], auto_loan: ['Auto loan', '🚙'], personal_loan: ['Personal loan', '🤝'],
  mortgage: ['Mortgage', '🏠'], other_liability: ['Other debt', '📄'],
};

export function NetWorth() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<{ acct: Account | null; kind: 'asset' | 'liability' } | null>(null);
  const nw = useMemo(() => netWorth(state.accounts, state.debts), [state.accounts, state.debts]);
  const month = monthOf(state.today);
  const history = state.netWorthSnapshots.map((s) => ({ label: monthLabelShortYear(s.month), 'Net worth': s.assets - s.liabilities, Assets: s.assets, Liabilities: s.liabilities }));
  const prev = state.netWorthSnapshots.find((s) => s.month === addMonthsToMonth(month, -1));
  const yearAgo = state.netWorthSnapshots.find((s) => s.month === addMonthsToMonth(month, -12));
  const assets = state.accounts.filter((a) => a.kind === 'asset');
  const liabs = state.accounts.filter((a) => a.kind === 'liability');

  const del = async (a: Account) => {
    const used = state.transactions.filter((t) => t.account_id === a.id).length;
    if (!(await confirm({ title: `Delete ${a.name}?`, message: `The account is removed from your net worth.${used ? ` ${used} transactions linked to it are kept but unlinked.` : ''}` }))) return;
    await run(() => api.del(`/api/accounts/${a.id}`), 'Account deleted');
  };

  const AccountRow = ({ a }: { a: Account }) => {
    const [label, icon] = (a.kind === 'asset' ? ASSET_TYPES : LIABILITY_TYPES)[a.type] ?? ['Account', '•'];
    return (
      <div className="list-row">
        <div className="tx-icon" style={{ background: a.kind === 'asset' ? 'var(--green-dim)' : 'var(--red-dim)' }}>{icon}</div>
        <div className="tx-main">
          <div className="tx-title">{a.name} <DemoBadge show={a.is_demo} /></div>
          <div className="tx-meta">
            {label} · {a.verified ? <span className="pos"><ShieldCheck size={10} /> Verified balance</span> : <span style={{ color: 'var(--yellow)' }}><CircleDashed size={10} /> Estimate</span>}
            {a.include_in_available ? ' · Available to spend' : ''} · updated {relativeDay(a.updated_at.slice(0, 10), state.today).toLowerCase()}
          </div>
        </div>
        <b className={`num ${a.kind === 'liability' ? 'neg' : ''}`}>{money(a.balance)}</b>
        <button className="icon-btn sm" onClick={() => setEdit({ acct: a, kind: a.kind })} aria-label={`Edit ${a.name}`}><Pencil size={13} /></button>
        <button className="icon-btn sm" onClick={() => del(a)} aria-label={`Delete ${a.name}`}><Trash2 size={13} /></button>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>Net Worth</h2><p>Net worth = total assets − total liabilities. Balances are entered manually; mark ones you've confirmed against a statement as verified.</p></div>
        <div className="row-wrap">
          <button className="btn" onClick={() => setEdit({ acct: null, kind: 'liability' })}><Plus size={15} />Liability</button>
          <button className="btn btn-primary" onClick={() => setEdit({ acct: null, kind: 'asset' })}><Plus size={15} />Asset</button>
        </div>
      </div>
      <div className="grid grid-4 mb-16">
        <StatCard accent label="Net worth" value={money(nw.net, { whole: true })} delta={<Delta value={prev ? pctChange(nw.net, prev.assets - prev.liabilities) : null} label="vs last month" />} />
        <StatCard label="Total assets" value={money(nw.totalAssets, { whole: true })} delta={<span className="stat-delta">{money(nw.verifiedAssets, { whole: true })} verified · {money(nw.estimatedAssets, { whole: true })} estimated</span>} />
        <StatCard label="Total liabilities" value={<span className="neg">{money(nw.totalLiabilities, { whole: true })}</span>} delta={<span className="stat-delta">accounts + <Link to="/debts" className="card-link" style={{ fontSize: 12 }}>tracked debts</Link></span>} />
        <StatCard label="12-month change" value={yearAgo ? money(nw.net - (yearAgo.assets - yearAgo.liabilities), { whole: true, sign: true }) : '—'} delta={<Delta value={yearAgo ? pctChange(nw.net, yearAgo.assets - yearAgo.liabilities) : null} label="vs a year ago" />} />
      </div>
      <Card title="Net worth history" sub="Recorded monthly — the current month updates whenever balances change" className="mb-16">
        {history.length > 1 ? <AreaSingle data={history} dataKey="Net worth" name="Net worth" height={260} /> : <div className="muted small">History builds automatically as months pass. Come back next month to see your trend.</div>}
      </Card>
      <div className="grid grid-2">
        <Card title="Assets" sub={money(nw.totalAssets)} action={<button className="card-link" onClick={() => setEdit({ acct: null, kind: 'asset' })}>+ Add asset</button>}>
          {assets.length ? <div className="list">{assets.map((a) => <AccountRow key={a.id} a={a} />)}</div>
            : <Empty icon={Landmark} title="No assets yet" text="Add checking, savings, investments, retirement accounts, vehicles and more." />}
        </Card>
        <Card title="Liabilities" sub={money(nw.totalLiabilities)} action={<button className="card-link" onClick={() => setEdit({ acct: null, kind: 'liability' })}>+ Add liability</button>}>
          <div className="list">
            {liabs.map((a) => <AccountRow key={a.id} a={a} />)}
            {state.debts.map((d) => (
              <div key={`d${d.id}`} className="list-row">
                <div className="tx-icon" style={{ background: 'var(--red-dim)' }}>{LIABILITY_TYPES[d.type]?.[1] ?? '💳'}</div>
                <div className="tx-main"><div className="tx-title">{d.name} <DemoBadge show={d.is_demo} /></div><div className="tx-meta">From Debt Tracker · {d.apr}% APR</div></div>
                <b className="num neg">{money(d.current_balance)}</b>
                <Link to="/debts" className="btn btn-sm btn-ghost">Manage</Link>
              </div>
            ))}
            {liabs.length === 0 && state.debts.length === 0 && <Empty icon={Landmark} title="No liabilities" text="Add loans in the Debt Tracker, or other balances you owe here." />}
          </div>
        </Card>
      </div>
      <AccountModal state={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function AccountModal({ state: s, onClose }: { state: { acct: Account | null; kind: 'asset' | 'liability' } | null; onClose: () => void }) {
  const { run } = useData();
  const [v, setV] = useState({ name: '', type: 'checking', balance: '', verified: false, include_in_available: false, notes: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!s) return;
    setErr({});
    setV(s.acct ? { name: s.acct.name, type: s.acct.type, balance: centsToInput(s.acct.balance), verified: !!s.acct.verified, include_in_available: !!s.acct.include_in_available, notes: s.acct.notes ?? '' }
      : { name: '', type: s.kind === 'asset' ? 'checking' : 'credit_card', balance: '', verified: false, include_in_available: s.kind === 'asset', notes: '' });
  }, [s]);
  if (!s) return null;
  const types = s.kind === 'asset' ? ASSET_TYPES : LIABILITY_TYPES;
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((p) => ({ ...p, [k]: x })); setErr((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    const e: Record<string, string> = {};
    const bal = parseMoney(v.balance);
    if (!v.name.trim()) e.name = 'Enter a name';
    if (bal == null || bal < 0) e.balance = 'Enter a balance of $0 or more';
    if (Object.keys(e).length) return setErr(e);
    const body = { name: v.name.trim(), kind: s.kind, type: v.type, balance: bal, verified: v.verified, include_in_available: s.kind === 'asset' && v.include_in_available, notes: v.notes.trim() || null };
    try {
      if (s.acct) await run(() => api.put(`/api/accounts/${s.acct!.id}`, body), 'Account updated');
      else await run(() => api.post('/api/accounts', body), 'Account added');
      onClose();
    } catch (ex) { if (ex instanceof ApiError && ex.fields) setErr(ex.fields); }
  };
  return (
    <Modal open onClose={onClose} title={`${s.acct ? 'Edit' : 'Add'} ${s.kind}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name" error={err.name} full htmlFor="a-name"><input id="a-name" className={`input${err.name ? ' invalid' : ''}`} value={v.name} maxLength={60} placeholder={s.kind === 'asset' ? 'e.g. Everyday Checking' : 'e.g. Store card'} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Type" htmlFor="a-type"><select id="a-type" className="input" value={v.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(types).map(([k, [l, i]]) => <option key={k} value={k}>{i} {l}</option>)}</select></Field>
        <Field label={s.kind === 'asset' ? 'Current value' : 'Amount owed'} error={err.balance} htmlFor="a-bal"><MoneyInput id="a-bal" value={v.balance} onChange={(x) => set('balance', x)} invalid={!!err.balance} /></Field>
        <label className="check field full"><input type="checkbox" checked={v.verified} onChange={(e) => set('verified', e.target.checked)} />Verified — I confirmed this balance against a statement or my bank app</label>
        {s.kind === 'asset' && <label className="check field full"><input type="checkbox" checked={v.include_in_available} onChange={(e) => set('include_in_available', e.target.checked)} />Available to spend — count this toward Safe-to-Spend</label>}
        <Field label="Notes (optional)" full htmlFor="a-notes"><input id="a-notes" className="input" maxLength={500} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="tiny muted field full">Vault never asks for bank usernames or passwords. Balances are entered by you.</div>
      </div>
    </Modal>
  );
}
