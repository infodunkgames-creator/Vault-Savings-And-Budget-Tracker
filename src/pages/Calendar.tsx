import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useAppState } from '../store/DataContext';
import { Card, Empty } from '../components/ui';
import { calendarEvents, type CalendarEvent } from '../lib/finance';
import { addDays, addMonthsToMonth, dateLabel, monthEnd, monthLabel, monthOf, monthStart, weekday } from '../lib/dates';
import { money } from '../lib/money';

const KIND_LABEL: Record<CalendarEvent['kind'], string> = { bill: 'Bill', income: 'Paycheck / income', savings: 'Savings contribution', recurring: 'Recurring transaction', debt: 'Debt payment' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Calendar() {
  const state = useAppState();
  const [month, setMonth] = useState(monthOf(state.today));
  const [selected, setSelected] = useState(state.today);
  const [hidden, setHidden] = useState<Set<CalendarEvent['kind']>>(new Set());
  const weekStart = state.settings.preferences.weekStartsOn ?? 0;

  const gridStart = useMemo(() => { let d = monthStart(month); while (weekday(d) !== weekStart) d = addDays(d, -1); return d; }, [month, weekStart]);
  const gridEnd = useMemo(() => { let d = monthEnd(month); while (weekday(d) !== (weekStart + 6) % 7) d = addDays(d, 1); return d; }, [month, weekStart]);
  const events = useMemo(() => calendarEvents(state, gridStart, gridEnd, state.today).filter((e) => !hidden.has(e.kind)), [state, gridStart, gridEnd, hidden]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    events.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return m;
  }, [events]);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const inMonth = events.filter((e) => monthOf(e.date) === month);
  const inflow = inMonth.filter((e) => e.kind === 'income' || (e.kind === 'recurring' && e.amount > 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
  const outflow = inMonth.filter((e) => e.kind === 'bill' || e.kind === 'debt' || (e.kind === 'recurring' && e.amount < 0)).reduce((s, e) => s + Math.abs(e.amount), 0);
  const savings = inMonth.filter((e) => e.kind === 'savings').reduce((s, e) => s + e.amount, 0);
  const dayEvents = byDay.get(selected) ?? [];
  const upcoming = calendarEvents(state, state.today, addDays(state.today, 14), state.today).filter((e) => !e.done && !hidden.has(e.kind));

  const toggle = (k: CalendarEvent['kind']) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div>
      <div className="page-head">
        <div><h2>Financial Calendar</h2><p>Bills, paydays, savings contributions, debt payments and recurring transactions at a glance.</p></div>
        <div className="row">
          <button className="icon-btn" onClick={() => setMonth(addMonthsToMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <div className="bold" style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel(month, true)}</div>
          <button className="icon-btn" onClick={() => setMonth(addMonthsToMonth(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          {month !== monthOf(state.today) && <button className="btn btn-sm btn-ghost" onClick={() => { setMonth(monthOf(state.today)); setSelected(state.today); }}>Today</button>}
        </div>
      </div>
      <div className="row-wrap mb-16">
        {(Object.keys(KIND_LABEL) as CalendarEvent['kind'][]).map((k) => (
          <button key={k} className={`badge ev-${k}`} style={{ cursor: 'pointer', opacity: hidden.has(k) ? 0.35 : 1, padding: '5px 11px', border: 0 }} onClick={() => toggle(k)} aria-pressed={!hidden.has(k)}>{KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="grid grid-main">
        <Card>
          <div className="cal" role="grid" aria-label={monthLabel(month, true)}>
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="cal-dow">{DOW[(i + weekStart) % 7]}</div>)}
            {days.map((d) => {
              const evs = byDay.get(d) ?? [];
              return (
                <div key={d} role="gridcell" tabIndex={0} aria-selected={d === selected}
                  className={`cal-day${monthOf(d) !== month ? ' out' : ''}${d === state.today ? ' today' : ''}${d === selected ? ' sel' : ''}`}
                  onClick={() => setSelected(d)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(d); }}>
                  <div className="cal-num">{Number(d.slice(8))}</div>
                  {evs.slice(0, 3).map((e, i) => <div key={i} className={`cal-ev ev-${e.kind}${e.done ? ' done' : ''}`} title={`${e.title} · ${money(Math.abs(e.amount))}`}>{e.title}</div>)}
                  {evs.length > 3 && <div className="tiny muted hide-md">+{evs.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </Card>
        <div className="stack">
          <Card title={dateLabel(selected, { weekday: true, year: true })} sub={`${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'}`}>
            {dayEvents.length === 0 ? <div className="muted small">Nothing scheduled.</div> : (
              <div className="list">
                {dayEvents.map((e, i) => (
                  <Link to={e.link} key={i} className="list-row" style={{ padding: '9px 0' }}>
                    <span className={`legend-dot ev-${e.kind}`} style={{ width: 10, height: 10 }} />
                    <div className="tx-main"><div className="tx-title small">{e.title}</div><div className="tx-meta">{KIND_LABEL[e.kind]}{e.done ? ' · done' : ''}</div></div>
                    {e.done && <CheckCircle2 size={14} color="var(--green)" />}
                    <b className={`small num ${e.kind === 'income' || e.amount > 0 && e.kind === 'recurring' ? 'pos' : ''}`}>{money(Math.abs(e.amount))}</b>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card title={`${monthLabel(month)} at a glance`}>
            <div className="kv"><span>Expected income</span><b className="pos num">{money(inflow, { whole: true })}</b></div>
            <div className="kv"><span>Bills, debts & recurring</span><b className="neg num">{money(outflow, { whole: true })}</b></div>
            <div className="kv"><span>Planned savings</span><b className="num" style={{ color: '#8fb6ff' }}>{money(savings, { whole: true })}</b></div>
          </Card>
          <Card title="Next 14 days">
            {upcoming.length === 0 ? <Empty icon={CalendarDays} title="Nothing coming up" /> : (
              <div className="list">
                {upcoming.slice(0, 8).map((e, i) => (
                  <div key={i} className="list-row" style={{ padding: '8px 0' }}>
                    <span className="small muted" style={{ width: 52 }}>{dateLabel(e.date)}</span>
                    <span className={`badge ev-${e.kind}`} style={{ flex: '0 0 auto' }}>{e.kind}</span>
                    <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                    <b className="small num">{money(Math.abs(e.amount), { whole: true })}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
