import { useEffect, useRef, useState } from 'react';
import { Download, Upload, FlaskConical, Trash2, Bell, Database, Globe, Shield, RotateCcw, LogOut } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, Field } from '../components/ui';
import { useConfirm } from '../components/Modal';
import { initials } from '../components/Layout';
import { api } from '../lib/api';
import type { NotificationPrefs } from '../lib/types';

export function Profile() {
  const state = useAppState();
  const { run } = useData();
  const [name, setName] = useState(state.settings.profile.name);
  const [email, setEmail] = useState(state.settings.profile.email);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => { setName(state.settings.profile.name); setEmail(state.settings.profile.email); }, [state.settings.profile]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!name.trim()) er.name = 'Enter your name';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) er.email = 'Enter a valid email address';
    if (Object.keys(er).length) return setErr(er);
    await run(() => api.put('/api/settings/profile', { name: name.trim(), email: email.trim() }), 'Profile saved');
  };
  const { reload } = useData();
  const [authRequired, setAuthRequired] = useState(false);
  useEffect(() => { api.get<{ required: boolean }>('/api/auth/status').then((r) => setAuthRequired(r.required)).catch(() => {}); }, []);
  const logout = async () => { await api.post('/api/auth/logout'); await reload(); };
  const counts = [
    ['Transactions', state.transactions.length], ['Accounts', state.accounts.length], ['Bills', state.bills.length],
    ['Savings goals', state.goals.length], ['Debts', state.debts.length], ['Income sources', state.incomeSources.length],
  ] as const;
  return (
    <div>
      <div className="page-head"><div><h2>Profile</h2><p>How Vault greets you. Profile details never leave this device.</p></div></div>
      <div className="grid grid-main">
        <Card title="Your details">
          <form className="form" onSubmit={save} noValidate style={{ maxWidth: 480 }}>
            <div className="row" style={{ gap: 14 }}>
              <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{initials(name)}</div>
              <div><div className="bold">{name || 'Your name'}</div><div className="muted small">{email || 'No email set'}</div></div>
            </div>
            <Field label="Name" error={err.name} htmlFor="p-name"><input id="p-name" className={`input${err.name ? ' invalid' : ''}`} value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setErr({}); }} /></Field>
            <Field label="Email (optional)" error={err.email} hint="Reserved for future account sign-in; nothing is sent." htmlFor="p-email"><input id="p-email" type="email" className={`input${err.email ? ' invalid' : ''}`} value={email} maxLength={120} onChange={(e) => { setEmail(e.target.value); setErr({}); }} /></Field>
            <div><button className="btn btn-primary" type="submit">Save profile</button></div>
          </form>
        </Card>
        <Card title="Your data at a glance">
          {counts.map(([l, n]) => <div className="kv" key={l}><span>{l}</span><b className="num">{n}</b></div>)}
          <div className="divider" />
          <div className="small muted row" style={{ alignItems: 'flex-start' }}><Shield size={14} style={{ flexShrink: 0, marginTop: 2 }} />Vault uses manual entry only. It never asks for, or stores, bank usernames, passwords or account credentials.</div>
          {authRequired && <><div className="divider" /><button className="btn" onClick={logout}><LogOut size={15} />Sign out of this device</button></>}
        </Card>
      </div>
    </div>
  );
}

export function Preferences() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [n, setN] = useState<NotificationPrefs>(state.settings.notifications);
  const [prefs, setPrefs] = useState(state.settings.preferences);
  useEffect(() => { setN(state.settings.notifications); setPrefs(state.settings.preferences); }, [state.settings]);
  const setNotif = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) => setN((s) => ({ ...s, [k]: v }));

  const saveNotif = () => run(() => api.put('/api/settings/notifications', n), 'Notification preferences saved');
  const savePrefs = () => run(() => api.put('/api/settings/preferences', prefs), 'Preferences saved');

  const restore = async (f: File | undefined) => {
    if (!f) return;
    let data: unknown;
    try { data = JSON.parse(await f.text()); } catch { await confirm({ title: 'Invalid file', message: 'That file is not valid JSON.', confirmLabel: 'OK', danger: false }); return; }
    if ((data as { app?: string })?.app !== 'vault') { await confirm({ title: 'Not a Vault backup', message: 'Choose a .json file created with “Download backup”.', confirmLabel: 'OK', danger: false }); return; }
    if (!(await confirm({ title: 'Restore from backup?', message: 'All current data will be replaced with the contents of this backup. Download a backup of your current data first if you might need it.', confirmLabel: 'Replace my data', requireText: 'RESTORE' }))) return;
    await run(() => api.post('/api/restore', data), 'Backup restored');
  };
  const loadDemo = () => run(() => api.post('/api/demo'), 'Demo data loaded');
  const removeDemo = async () => {
    if (!(await confirm({ title: 'Remove demo data?', message: 'Every record tagged DEMO is deleted. Your own entries, categories and budgets are kept.', confirmLabel: 'Remove demo data' }))) return;
    await run(() => api.del('/api/demo'), 'Demo data removed');
  };
  const wipe = async () => {
    if (!(await confirm({ title: 'Delete all data?', message: 'Every transaction, account, bill, goal, debt and setting will be permanently deleted and default categories restored. This cannot be undone.', confirmLabel: 'Delete everything', requireText: 'DELETE' }))) return;
    await run(() => api.del('/api/data?confirm=DELETE'), 'All data deleted');
  };

  return (
    <div>
      <div className="page-head"><div><h2>Preferences</h2><p>Notifications, display options and your data.</p></div></div>
      <div className="grid grid-2">
        <Card title={<span className="row"><Bell size={16} />Notifications</span>} sub="Shown in the bell menu at the top of every page">
          <div className="form">
            <label className="check"><input type="checkbox" checked={n.bills} onChange={(e) => setNotif('bills', e.target.checked)} />Upcoming and overdue bills</label>
            <div className="row" style={{ paddingLeft: 25 }}>
              <span className="small muted">Remind me</span>
              <input type="number" min={0} max={30} className="input" style={{ width: 72, height: 34 }} value={n.billLeadDays} disabled={!n.bills} onChange={(e) => setNotif('billLeadDays', Number(e.target.value))} aria-label="Days before due" />
              <span className="small muted">days before a bill is due</span>
            </div>
            <label className="check"><input type="checkbox" checked={n.budgetWarning} onChange={(e) => setNotif('budgetWarning', e.target.checked)} />Budget limit approaching</label>
            <div className="row" style={{ paddingLeft: 25 }}>
              <span className="small muted">Warn at</span>
              <input type="number" min={1} max={100} className="input" style={{ width: 72, height: 34 }} value={n.budgetThreshold} onChange={(e) => setNotif('budgetThreshold', Number(e.target.value))} aria-label="Budget warning threshold" />
              <span className="small muted">% of a category budget</span>
            </div>
            <label className="check"><input type="checkbox" checked={n.budgetOver} onChange={(e) => setNotif('budgetOver', e.target.checked)} />Budget overspending</label>
            <label className="check"><input type="checkbox" checked={n.goalMilestones} onChange={(e) => setNotif('goalMilestones', e.target.checked)} />Savings goal milestones (25%, 50%, 75%, 100%)</label>
            <label className="check"><input type="checkbox" checked={n.monthlySummary} onChange={(e) => setNotif('monthlySummary', e.target.checked)} />Monthly financial summary (first week of each month)</label>
            <div className="row-wrap">
              <button className="btn btn-primary" onClick={saveNotif}>Save notification settings</button>
              {state.dismissedNotifications.length > 0 && <button className="btn btn-ghost" onClick={() => run(() => api.del('/api/notifications/dismiss'), 'Dismissed notifications restored')}><RotateCcw size={14} />Restore {state.dismissedNotifications.length} dismissed</button>}
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card title={<span className="row"><Globe size={16} />Display</span>}>
            <div className="form-grid">
              <Field label="Currency" htmlFor="pr-cur">
                <select id="pr-cur" className="input" value={prefs.currency} onChange={(e) => setPrefs({ ...prefs, currency: e.target.value })}>
                  {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'CHF', 'MXN', 'BRL'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Week starts on" htmlFor="pr-week">
                <select id="pr-week" className="input" value={prefs.weekStartsOn} onChange={(e) => setPrefs({ ...prefs, weekStartsOn: Number(e.target.value) })}>
                  <option value={0}>Sunday</option><option value={1}>Monday</option>
                </select>
              </Field>
            </div>
            <div className="tiny muted" style={{ margin: '8px 0 12px' }}>Currency changes formatting only; amounts are not converted.</div>
            <button className="btn btn-primary" onClick={savePrefs}>Save display settings</button>
          </Card>

          <Card title={<span className="row"><Database size={16} />Data & backups</span>} sub="Everything is stored in a local SQLite database on the Vault server">
            <div className="stack" style={{ gap: 10 }}>
              <div className="row-wrap">
                <a className="btn" href="/api/export" download><Download size={15} />Download backup (JSON)</a>
                <a className="btn" href="/api/export/transactions.csv" download><Download size={15} />Transactions (CSV)</a>
              </div>
              <div className="row-wrap">
                <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />Restore from backup</button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              <div className="tiny muted">To import bank transactions, use <b>Import CSV</b> on the Transactions page — duplicates are detected automatically.</div>
              <div className="divider" />
              <div className="row-wrap">
                {state.hasDemo
                  ? <button className="btn" onClick={removeDemo}><FlaskConical size={15} />Remove demo data</button>
                  : <button className="btn" onClick={loadDemo}><FlaskConical size={15} />Load demo data</button>}
                <button className="btn btn-danger" onClick={wipe}><Trash2 size={15} />Delete all data</button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
