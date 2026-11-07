// Timezone-safe helpers for 'YYYY-MM-DD' date strings (all math done in UTC).
export const pad = (n) => String(n).padStart(2, '0');

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmt(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
export function addDays(iso, n) {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
export function daysInMonth(y, m /* 1-12 */) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Add months, clamping the day to the end of the target month (Jan 31 + 1mo = Feb 28/29). */
export function addMonths(iso, n, keepDay) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(keepDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(day)}`;
}
export const monthOf = (iso) => iso.slice(0, 7);
export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parse(s);
  return fmt(d) === s;
}
