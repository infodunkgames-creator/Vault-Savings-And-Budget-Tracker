// Date helpers. Dates are plain text: 'YYYY-MM-DD' for days, 'YYYY-MM' for months.
// We build them from the LOCAL clock. (new Date().toISOString() uses UTC, which
// would give tomorrow's date in the evening in US time zones.)

const pad = (n) => String(n).padStart(2, '0');

// Today as 'YYYY-MM-DD'
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// This month as 'YYYY-MM'
export function currentMonth() {
  return today().slice(0, 7);
}

// addMonths('2026-12', 1) -> '2027-01'    addMonths('2026-01', -1) -> '2025-12'
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n; // months since year 0
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

// '2026-11' -> 'November 2026'
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// '2026-11-05' -> 'Nov 5'
export function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// True for text like '2026-11'
export function isMonth(text) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}
