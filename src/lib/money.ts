import type { Cents } from './types';

let currency = 'USD';
let locale = 'en-US';
const cache = new Map<string, Intl.NumberFormat>();

export function setCurrency(c: string, l = 'en-US') {
  currency = c || 'USD';
  locale = l || 'en-US';
  cache.clear();
}
function nf(key: string, opts: Intl.NumberFormatOptions) {
  const k = `${currency}|${locale}|${key}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, ...opts });
    cache.set(k, f);
  }
  return f;
}

/** Format integer cents as currency. `sign` adds an explicit +/−; `whole` drops cents. */
export function money(cents: Cents, opts: { sign?: boolean; whole?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(cents) / 100;
  let s: string;
  if (opts.compact && abs >= 10000) s = nf('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(abs);
  else if (opts.whole) s = nf('whole', { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(abs);
  else s = nf('std', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  if (cents < 0) return `−${s}`;
  if (opts.sign && cents > 0) return `+${s}`;
  return s;
}
export const moneyWhole = (c: Cents) => money(c, { whole: true });

/** Parse user input like "$1,234.56" or "1234.5" into integer cents. Returns null when invalid. */
export function parseMoney(input: string | number | null | undefined): Cents | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  const s = input.trim().replace(/[\s,$€£¥]/g, '');
  if (!s) return null;
  let neg = false;
  let t = s;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith('-') || t.startsWith('−')) { neg = true; t = t.slice(1); }
  if (!/^\d*(\.\d{0,2})?$/.test(t) || t === '' || t === '.') return null;
  const [whole, frac = ''] = t.split('.');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -cents : cents;
}
/** Cents → plain input string ("1234.50"). */
export const centsToInput = (c: Cents | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

export function pct(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}
/** Percentage change from prev to cur; null when prev is 0 (undefined change). */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
