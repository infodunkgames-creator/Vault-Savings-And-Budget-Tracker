import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, History, Archive, ArchiveRestore, PiggyBank, ArrowDownLeft, ArrowUpRight, Target } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, ColorPicker, DemoBadge, EmojiPicker, Empty, Field, MoneyInput, Progress, StatCard } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { goalStats } from '../lib/finance';
import { dateLabel, isValidISODate } from '../lib/dates';
import { centsToInput, money, parseMoney } from '../lib/money';
import type { Goal } from '../lib/types';

const GOAL_EMOJI = ['🛟', '✈️', '🚗', '🏡', '🎓', '📈', '💍', '👶', '💻', '🏖️', '🎯', '🩺'];

export function Goals() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<{ goal: Goal | null } | null>(null);
  const [contrib, setContrib] = useState<{ goal: Goal; mode: 'add' | 'withdraw' } | null>(null);
  const [history, setHistory] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = state.goals.filter((g) => !g.archived);
  const archived = state.goals.filter((g) => g.archived);
  const stats = useMemo(() => new Map(state.goals.map((g) => [g.id, goalStats(g, state.goalContributions, state.today)])), [state.goals, state.goalContributions, state.today]);
  const totalSaved = active.reduce((s, g) => s + stats.get(g.id)!.saved, 0);
  const totalTarget = active.reduce((s, g) => s + g.target, 0);
  const monthly = active.reduce((s, g) => s + g.monthly_contribution, 0);
  const thisMonth = active.reduce((s, g) => s + stats.get(g.id)!.contributedThisMonth, 0);

  const del = async (g: Goal) => {
    if (!(await confirm({ title: `Delete “${g.name}”?`, message: 'The goal and its entire contribution history will be permanently deleted. Account balances are not changed. To keep the history, archive it instead.' }))) return;
    await run(() => api.del(`/api/goals/${g.id}`), 'Goal deleted');
  };
  const toggleArchive = (g: Goal) => run(() => api.put(`/api/goals/${g.id}`, { archived: !g.archived }), g.archived ? 'Goal restored' : 'Goal archived');

  const list = showArchived ? archived : active;
  return (
    <div>
      <div className="page-head">
        <div><h2>Savings Goals</h2><p>Set targets, contribute over time and see exactly when you'll get there.</p></div>
        <button className="btn btn-primary" onClick={() => setEdit({ goal: null })}><Plus size={16} />New goal</button>
      </div>
      <div className="grid grid-4 mb-16">
        <StatCard label="Total saved" value={money(totalSaved, { whole: true })} delta={<span className="stat-delta">across {active.length} active goals</span>} />
        <StatCard label="Total target" value={money(totalTarget, { whole: true })} delta={<span className="stat-delta">{totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0}% funded overall</span>} />
        <StatCard label="Planned monthly" value={money(monthly, { whole: true })} delta={<span className="stat-delta">committed contributions</span>} />
        <StatCard label="This month" value={money(thisMonth, { whole: true })} delta={<span className="stat-delta">{monthly ? `${Math.round((Math.max(0, thisMonth) / monthly) * 100)}% of plan contributed` : 'net contributions'}</span>} />
      </div>
      {archived.length > 0 && (
        <div className="row mb-16"><button className="btn btn-sm btn-ghost" onClick={() => setShowArchived((s) => !s)}>{showArchived ? '← Active goals' : `Archived (${archived.length})`}</button></div>
      )}
      {list.length === 0 ? (
        <Card><Empty icon={PiggyBank} title={showArchived ? 'No archived goals' : 'No savings goals yet'} text="Emergency fund, a trip, a new car — give your savings a purpose." action={!showArchived && <button className="btn btn-primary btn-sm" onClick={() => setEdit({ goal: null })}><Plus size={14} />Create a goal</button>} /></Card>
      ) : (
        <div className="grid grid-2">
          {list.map((g) => {
            const s = stats.get(g.id)!;
            return (
              <Card key={g.id}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="tx-icon" style={{ width: 46, height: 46, fontSize: 22, background: `${g.color}1f` }}>{g.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}><h3 style={{ fontSize: 16 }}>{g.name}</h3><DemoBadge show={g.is_demo} /></div>
                    <div className="small muted">{g.description || (g.target_date ? `Target ${dateLabel(g.target_date, { year: true })}` : 'No target date')}</div>
                  </div>
                  {s.complete ? <span className="badge badge-green">Funded 🎉</span>
                    : s.onTrack === true ? <span className="badge badge-green">On track</span>
                      : s.onTrack === false ? <span className="badge badge-yellow">Behind</span> : null}
                </div>
                <div className="row" style={{ margin: '16px 0 8px', alignItems: 'baseline' }}>
                  <span className="num" style={{ fontSize: 24, fontWeight: 800, color: g.color }}>{money(s.saved, { whole: true })}</span>
                  <span className="muted num">of {money(g.target, { whole: true })}</span>
                  <span className="spacer" /><b className="num">{Math.floor(s.pct)}%</b>
                </div>
                <Progress lg value={s.pct} color={g.color} />
                <div className="grid grid-2" style={{ gap: 0, columnGap: 18, marginTop: 12 }}>
                  <div className="kv"><span>Remaining</span><b className="num">{money(s.remaining)}</b></div>
                  <div className="kv"><span>Planned / month</span><b className="num">{g.monthly_contribution ? money(g.monthly_contribution) : '—'}</b></div>
                  <div className="kv"><span>Needed / month</span><b className="num">{s.requiredMonthly != null ? money(s.requiredMonthly) : '—'}</b></div>
                  <div className="kv"><span>Est. completion</span><b>{s.estimatedCompletion ? dateLabel(s.estimatedCompletion, { year: true }) : '—'}</b></div>
                </div>
                {s.requiredMonthly != null && s.pace < s.requiredMonthly && !s.complete && (
                  <div className="tiny" style={{ color: 'var(--yellow)', marginTop: 6 }}>Contribute {money(s.requiredMonthly - s.pace)} more per month to hit your target date.</div>
                )}
                <div className="row-wrap" style={{ marginTop: 14 }}>
                  {!g.archived && <button className="btn btn-sm btn-primary" onClick={() => setContrib({ goal: g, mode: 'add' })}><ArrowDownLeft size={13} />Add money</button>}
                  {!g.archived && <button className="btn btn-sm" disabled={s.saved <= 0} onClick={() => setContrib({ goal: g, mode: 'withdraw' })}><ArrowUpRight size={13} />Withdraw</button>}
                  <button className="btn btn-sm btn-ghost" onClick={() => setHistory(g)}><History size={13} />History</button>
                  <span className="spacer" />
                  <button className="icon-btn sm" onClick={() => setEdit({ goal: g })} aria-label={`Edit ${g.name}`}><Pencil size={13} /></button>
                  <button className="icon-btn sm" onClick={() => toggleArchive(g)} aria-label={g.archived ? 'Restore' : 'Archive'} title={g.archived ? 'Restore' : 'Archive'}>{g.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>
                  <button className="icon-btn sm" onClick={() => del(g)} aria-label={`Delete ${g.name}`}><Trash2 size={13} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <GoalModal open={!!edit} goal={edit?.goal ?? null} onClose={() => setEdit(null)} />
      <ContributionModal state={contrib} onClose={() => setContrib(null)} />
      <HistoryModal goal={history} onClose={() => setHistory(null)} />
    </div>
  );
}

export function GoalModal({ open, onClose, goal = null }: { open: boolean; onClose: () => void; goal?: Goal | null }) {
  const { run } = useData();
  const [v, setV] = useState({ name: '', emoji: '🎯', color: '#00D9A0', target: '', target_date: '', description: '', monthly: '', initial: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setV(goal
      ? { name: goal.name, emoji: goal.emoji, color: goal.color, target: centsToInput(goal.target), target_date: goal.target_date ?? '', description: goal.description ?? '', monthly: goal.monthly_contribution ? centsToInput(goal.monthly_contribution) : '', initial: '' }
      : { name: '', emoji: '🎯', color: '#00D9A0', target: '', target_date: '', description: '', monthly: '', initial: '' });
  }, [open, goal]);
  const set = (k: keyof typeof v, x: string) => { setV((s) => ({ ...s, [k]: x })); setErr((e) => ({ ...e, [k]: '' })); };
  const { state } = useData();
  const save = async () => {
    const e: Record<string, string> = {};
    const target = parseMoney(v.target);
    const monthly = v.monthly.trim() ? parseMoney(v.monthly) : 0;
    const initial = v.initial.trim() ? parseMoney(v.initial) : 0;
    if (!v.name.trim()) e.name = 'Give your goal a name';
    if (target == null || target <= 0) e.target = 'Enter a target greater than zero';
    if (monthly == null || monthly < 0) e.monthly = 'Enter $0 or more';
    if (initial == null || initial < 0) e.initial = 'Enter $0 or more';
    if (v.target_date && (!isValidISODate(v.target_date) || v.target_date <= (state?.today ?? ''))) e.target_date = 'Choose a future date';
    if (Object.keys(e).length) return setErr(e);
    const body = { name: v.name.trim(), emoji: v.emoji, color: v.color, target, target_date: v.target_date || null, description: v.description.trim() || null, monthly_contribution: monthly };
    try {
      if (goal) await run(() => api.put(`/api/goals/${goal.id}`, body), 'Goal updated');
      else await run(async () => {
        const g = await api.post<Goal>('/api/goals', body);
        if (initial) await api.post(`/api/goals/${g.id}/contributions`, { amount: initial, date: state!.today, note: 'Starting balance' });
      }, 'Goal created');
      onClose();
    } catch (ex) { if (ex instanceof ApiError && ex.fields) setErr(ex.fields); }
  };
  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{goal ? 'Save changes' : 'Create goal'}</button></>}>
      <div className="form">
        <div className="form-grid">
          <Field label="Goal name" error={err.name} full htmlFor="g-name"><input id="g-name" className={`input${err.name ? ' invalid' : ''}`} value={v.name} maxLength={60} placeholder="e.g. Emergency Fund" onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Target amount" error={err.target} htmlFor="g-target"><MoneyInput id="g-target" value={v.target} onChange={(x) => set('target', x)} invalid={!!err.target} /></Field>
          <Field label="Target date (optional)" error={err.target_date} htmlFor="g-date"><input id="g-date" type="date" className="input" value={v.target_date} onChange={(e) => set('target_date', e.target.value)} /></Field>
          <Field label="Planned monthly contribution" error={err.monthly} hint="Counts toward safe-to-spend commitments" htmlFor="g-monthly"><MoneyInput id="g-monthly" value={v.monthly} onChange={(x) => set('monthly', x)} /></Field>
          {!goal && <Field label="Already saved (optional)" error={err.initial} htmlFor="g-init"><MoneyInput id="g-init" value={v.initial} onChange={(x) => set('initial', x)} /></Field>}
          <Field label="Description (optional)" full htmlFor="g-desc"><input id="g-desc" className="input" value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} /></Field>
        </div>
        <div className="field"><span className="label">Icon</span><EmojiPicker value={v.emoji} onChange={(x) => set('emoji', x)} options={GOAL_EMOJI} /></div>
        <div className="field"><span className="label">Color</span><ColorPicker value={v.color} onChange={(x) => set('color', x)} /></div>
      </div>
    </Modal>
  );
}

function ContributionModal({ state: s, onClose }: { state: { goal: Goal; mode: 'add' | 'withdraw' } | null; onClose: () => void }) {
  const app = useAppState();
  const { run } = useData();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(app.today);
  const [note, setNote] = useState('');
  const [account, setAccount] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!s) return;
    setAmount(s.mode === 'add' && s.goal.monthly_contribution ? centsToInput(s.goal.monthly_contribution) : '');
    setDate(app.today); setNote(''); setAccount(''); setErr('');
  }, [s, app.today]);
  if (!s) return null;
  const st = goalStats(s.goal, app.goalContributions, app.today);
  const save = async () => {
    const c = parseMoney(amount);
    if (c == null || c <= 0) return setErr('Enter an amount greater than zero');
    if (s.mode === 'withdraw' && c > st.saved) return setErr(`You can withdraw at most ${money(st.saved)}`);
    if (!isValidISODate(date)) return setErr('Choose a valid date');
    await run(() => api.post(`/api/goals/${s.goal.id}/contributions`, { amount: s.mode === 'add' ? c : -c, date, note: note.trim() || null, account_id: account ? Number(account) : null }),
      s.mode === 'add' ? `${money(c)} added to ${s.goal.name}` : `${money(c)} withdrawn from ${s.goal.name}`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${s.mode === 'add' ? 'Add money to' : 'Withdraw from'} ${s.goal.emoji} ${s.goal.name}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{s.mode === 'add' ? 'Add contribution' : 'Withdraw'}</button></>}>
      <div className="form">
        <div className="small muted">Saved so far: <b style={{ color: 'var(--text)' }}>{money(st.saved)}</b> · Remaining: <b style={{ color: 'var(--text)' }}>{money(st.remaining)}</b></div>
        <div className="form-grid">
          <Field label="Amount" error={err} htmlFor="c-amt"><MoneyInput id="c-amt" value={amount} onChange={(x) => { setAmount(x); setErr(''); }} invalid={!!err} /></Field>
          <Field label="Date" htmlFor="c-date"><input id="c-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={s.mode === 'add' ? 'Move money from (optional)' : 'Return money to (optional)'} hint="Adjusts that account's balance" full htmlFor="c-acct">
            <select id="c-acct" className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Don't change any account</option>
              {app.accounts.filter((a) => a.kind === 'asset' && ['checking', 'savings', 'cash'].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.balance, { whole: true })})</option>)}
            </select>
          </Field>
          <Field label="Note (optional)" full htmlFor="c-note"><input id="c-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function HistoryModal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  if (!goal) return null;
  const items = state.goalContributions.filter((c) => c.goal_id === goal.id);
  let running = items.reduce((s, c) => s + c.amount, 0);
  const rows = items.map((c) => { const bal = running; running -= c.amount; return { c, bal }; });
  const del = async (id: number, amt: number) => {
    if (!(await confirm({ title: 'Remove this entry?', message: `This ${amt > 0 ? 'contribution' : 'withdrawal'} of ${money(Math.abs(amt))} will be removed from the goal's history${state.goalContributions.find((x) => x.id === id)?.account_id ? ' and the linked account balance restored' : ''}.`, confirmLabel: 'Remove' }))) return;
    await run(() => api.del(`/api/goal-contributions/${id}`), 'Entry removed');
  };
  return (
    <Modal open onClose={onClose} title={`${goal.emoji} ${goal.name} — history`} wide>
      {rows.length === 0 ? <Empty icon={Target} title="No contributions yet" text="Contributions and withdrawals will appear here." /> : (
        <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>Date</th><th>Note</th><th className="right">Amount</th><th className="right">Balance</th><th /></tr></thead>
            <tbody>{rows.map(({ c, bal }) => (
              <tr key={c.id}>
                <td className="small">{dateLabel(c.date, { year: true })}</td>
                <td className="small muted">{c.note ?? (c.amount > 0 ? 'Contribution' : 'Withdrawal')} <DemoBadge show={c.is_demo} /></td>
                <td className={`right small bold num ${c.amount > 0 ? 'pos' : 'neg'}`}>{money(c.amount, { sign: true })}</td>
                <td className="right small num">{money(bal)}</td>
                <td className="right"><button className="icon-btn sm" onClick={() => del(c.id, c.amount)} aria-label="Remove entry"><Trash2 size={12} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
