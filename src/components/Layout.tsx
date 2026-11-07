import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, BarChart3, ArrowLeftRight, PieChart, Receipt, PiggyBank, CreditCard, CalendarDays, Landmark, User, SlidersHorizontal,
  Bell, Search, Menu, Plus, Wallet, CheckCheck, X, FlaskConical, MoreHorizontal,
} from 'lucide-react';
import { useData, useAppState } from '../store/DataContext';
import { buildNotifications } from '../lib/finance';
import { dateLabel, relativeDay } from '../lib/dates';
import { api } from '../lib/api';
import { TransactionModal } from './TransactionForm';
import { useConfirm } from './Modal';

const NAV: { section: string; items: { to: string; label: string; icon: typeof LayoutGrid; badge?: 'notif' | 'bills' }[] }[] = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutGrid }, { to: '/analytics', label: 'Analytics', icon: BarChart3 }] },
  {
    section: 'Finance', items: [
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { to: '/budgets', label: 'Budgets', icon: PieChart },
      { to: '/income', label: 'Income', icon: Wallet },
      { to: '/bills', label: 'Bills', icon: Receipt, badge: 'bills' },
      { to: '/goals', label: 'Savings Goals', icon: PiggyBank },
      { to: '/debts', label: 'Debt Tracker', icon: CreditCard },
    ],
  },
  { section: 'Planning', items: [{ to: '/calendar', label: 'Financial Calendar', icon: CalendarDays }, { to: '/net-worth', label: 'Net Worth', icon: Landmark }] },
  { section: 'Settings', items: [{ to: '/profile', label: 'Profile', icon: User }, { to: '/preferences', label: 'Preferences', icon: SlidersHorizontal }] },
];

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || 'V';

/** Pages can render controls into the top bar (e.g. the dashboard date range). */
export function TopbarSlot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById('topbar-slot')); }, []);
  return el ? createPortal(children, el) : null;
}

export function Layout() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const notifications = useMemo(() => buildNotifications(state, state.today), [state]);
  const billAlerts = notifications.filter((n) => n.kind === 'bill').length;
  const name = state.settings.profile.name || 'there';

  const clearDemo = async () => {
    if (!(await confirm({ title: 'Remove demo data?', message: 'All sample transactions, accounts, bills, goals and debts marked DEMO will be permanently removed. Anything you entered yourself is kept, along with your categories and budgets.', confirmLabel: 'Remove demo data' }))) return;
    await run(() => api.del('/api/demo'), 'Demo data removed. Vault is ready for your own numbers.');
  };

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <div className="brand"><div className="brand-mark">V</div>Vault</div>
        {NAV.map((s) => (
          <nav key={s.section} aria-label={s.section}>
            <div className="nav-section">{s.section}</div>
            {s.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <span className="nav-ico"><it.icon size={16} /></span>
                {it.label}
                {it.badge === 'bills' && billAlerts > 0 && <span className="nav-badge">{billAlerts}</span>}
              </NavLink>
            ))}
          </nav>
        ))}
        <div className="sidebar-foot">Manual entry · data stored locally<br />v1.0</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <div style={{ minWidth: 0 }}>
            <h1>{greeting()}, {name.split(' ')[0]} <span aria-hidden>👋</span></h1>
            <div className="date">{dateLabel(state.today, { weekday: true, year: true })}</div>
          </div>
          <div className="topbar-actions">
            <div id="topbar-slot" className="hide-md" />
            <SearchButton />
            <NotificationBell notifications={notifications} />
            <button className="btn btn-primary hide-sm" onClick={() => setAddOpen(true)}><Plus size={16} />Add</button>
            <NavLink to="/profile" className="avatar" title={name} aria-label="Profile">{initials(name)}</NavLink>
          </div>
        </header>

        {state.hasDemo && (
          <div className="banner" role="note">
            <FlaskConical size={18} color="var(--yellow)" />
            <div style={{ flex: '1 1 260px' }}>
              <b>You're viewing demo data.</b> <span className="muted">Records tagged <span className="badge badge-demo">DEMO</span> are samples, not real finances. Remove them when you're ready to add your own.</span>
            </div>
            <button className="btn btn-sm" onClick={clearDemo}>Remove demo data</button>
          </div>
        )}
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Quick navigation">
        <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' on' : ''}`}><LayoutGrid size={20} /><span>Home</span></NavLink>
        <NavLink to="/transactions" className={({ isActive }) => `tab${isActive ? ' on' : ''}`}><ArrowLeftRight size={20} /><span>Activity</span></NavLink>
        <button className="tab-add" onClick={() => setAddOpen(true)} aria-label="Add transaction"><Plus size={24} /></button>
        <NavLink to="/budgets" className={({ isActive }) => `tab${isActive ? ' on' : ''}`}><PieChart size={20} /><span>Budgets</span></NavLink>
        <button className={`tab${open ? ' on' : ''}`} onClick={() => setOpen(true)}><MoreHorizontal size={20} /><span>More</span>{billAlerts > 0 && <i className="tab-dot" />}</button>
      </nav>
      <TransactionModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function SearchButton() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Search transactions"><Search size={17} /></button>
      {open && (
        <form className="popover" style={{ width: 320, padding: 12 }} onSubmit={(e) => { e.preventDefault(); setOpen(false); nav(`/transactions?q=${encodeURIComponent(q.trim())}`); }}>
          <div className="search"><Search size={15} /><input autoFocus className="input" placeholder="Search transactions…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="tiny muted" style={{ marginTop: 8 }}>Press Enter to search descriptions, notes and categories.</div>
        </form>
      )}
    </div>
  );
}

function NotificationBell({ notifications }: { notifications: ReturnType<typeof buildNotifications> }) {
  const { run } = useData();
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const dismiss = (keys: string[]) => run(() => api.post('/api/notifications/dismiss', { keys }));
  const color = { danger: 'var(--red)', warning: 'var(--yellow)', success: 'var(--green)', info: 'var(--blue)' } as const;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${notifications.length})`}>
        <Bell size={17} />{notifications.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <b>Notifications</b><span className="badge badge-gray">{notifications.length}</span>
            <span className="spacer" />
            {notifications.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => dismiss(notifications.map((n) => n.key))}><CheckCheck size={14} />Clear all</button>}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {notifications.length === 0 && <div className="empty" style={{ padding: 28 }}><h4>You're all caught up</h4><p>Bill reminders, budget alerts and goal milestones appear here.</p></div>}
            {notifications.map((n) => (
              <div key={n.key} className="notif">
                <span className="notif-dot" style={{ background: color[n.severity] }} />
                <button style={{ flex: 1, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => { setOpen(false); nav(n.link); }}>
                  <div className="bold" style={{ fontSize: 13 }}>{n.title}</div>
                  <div className="muted small">{n.body}</div>
                  <div className="faint tiny" style={{ color: 'var(--faint)', marginTop: 2 }}>{relativeDay(n.date, state.today)}</div>
                </button>
                <button className="icon-btn sm" style={{ border: 0, background: 'transparent' }} onClick={() => dismiss([n.key])} aria-label="Dismiss"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <NavLink to="/preferences" className="card-link" onClick={() => setOpen(false)}>Notification preferences →</NavLink>
          </div>
        </div>
      )}
    </div>
  );
}
