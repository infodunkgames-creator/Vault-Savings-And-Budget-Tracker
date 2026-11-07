import type { Frequency, ISODate, Month } from './types';

// All date math is done on 'YYYY-MM-DD' strings in UTC so it never shifts across time zones.
export const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(now = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function parse(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmt(d: Date): ISODate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function addDays(iso: ISODate, n: number): ISODate {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function addMonths(iso: ISODate, n: number, keepDay?: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(keepDay ?? d, daysInMonth(ny, nm)))}`;
}
export const monthOf = (iso: ISODate): Month => iso.slice(0, 7);
export const monthStart = (m: Month): ISODate => `${m}-01`;
export function monthEnd(m: Month): ISODate {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${pad(daysInMonth(y, mo))}`;
}
export const addMonthsToMonth = (m: Month, n: number): Month => addMonths(`${m}-01`, n).slice(0, 7);
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}
/** Whole months from a to b (partial months count as a fraction). */
export function monthsBetween(a: ISODate, b: ISODate): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma) + (db - da) / 30.4375;
}
export function monthsList(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to && out.length < 600; m = addMonthsToMonth(m, 1)) out.push(m);
  return out;
}
export function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
}
export const weekday = (iso: ISODate) => parse(iso).getUTCDay();

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (m: Month, long = false) => {
  const [y, mo] = m.split('-').map(Number);
  return long ? `${MONTHS_LONG[mo - 1]} ${y}` : MONTHS_SHORT[mo - 1];
};
export const monthLabelShortYear = (m: Month) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ’${m.slice(2, 4)}`;
export function dateLabel(iso: ISODate, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const d = parse(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let s = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (opts.weekday) s = `${days[d.getUTCDay()]}, ${s}`;
  if (opts.year) s += `, ${d.getUTCFullYear()}`;
  return s;
}
export function relativeDay(iso: ISODate, today: ISODate): string {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return dateLabel(iso, { year: iso.slice(0, 4) !== today.slice(0, 4) });
}
export function time12(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---- Recurrence -------------------------------------------------------------------------------
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly',
  quarterly: 'Quarterly', yearly: 'Yearly', once: 'One time',
};
const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0,
};
/** Average monthly amount for a recurring schedule (used for planning, not for a specific month). */
export const monthlyEquivalent = (amount: number, f: Frequency) => Math.round(amount * PER_MONTH[f]);

/** All occurrences of a schedule that fall within [from, to] (inclusive). Never before the anchor. */
export function occurrences(frequency: Frequency, anchor: ISODate, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (to < from) return out;
  const start = from < anchor ? anchor : from;
  if (frequency === 'once') return anchor >= from && anchor <= to ? [anchor] : out;
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    const k = Math.max(0, Math.ceil(diffDays(anchor, start) / step));
    for (let d = addDays(anchor, k * step); d <= to; d = addDays(d, step)) out.push(d);
    return out;
  }
  const anchorDay = Number(anchor.slice(8, 10));
  if (frequency === 'semimonthly') {
    const d1 = anchorDay > 15 ? anchorDay - 15 : anchorDay;
    const d2 = d1 + 15;
    for (let m = monthOf(start); m <= monthOf(to); m = addMonthsToMonth(m, 1)) {
      const [y, mo] = m.split('-').map(Number);
      const dim = daysInMonth(y, mo);
      for (const d of [d1, d2]) {
        const iso = `${m}-${pad(Math.min(d, dim))}`;
        if (iso >= start && iso <= to && iso >= anchor) out.push(iso);
      }
    }
    return out;
  }
  const step = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  const monthsFromAnchor = Math.floor(monthsBetween(anchor, start));
  let k = Math.max(0, Math.floor(monthsFromAnchor / step) - 1);
  for (let guard = 0; guard < 2000; guard++, k++) {
    const d = addMonths(anchor, k * step, anchorDay);
    if (d > to) break;
    if (d >= start) out.push(d);
  }
  return out;
}
export function nextOccurrence(frequency: Frequency, anchor: ISODate, onOrAfter: ISODate): ISODate | null {
  return occurrences(frequency, anchor, onOrAfter, addMonths(onOrAfter, 13))[0] ?? null;
}
