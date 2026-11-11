// Small helpers that check incoming data before it reaches the database.
// Each returns true/false (or a cleaned value) so the routes stay readable.

// The five buckets, in the order the dashboard shows them.
export const BUCKETS = ['income', 'expense', 'bill', 'savings', 'debt'];

// "2026-11" -> true
export function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// "2026-11-30" -> true, "2026-11-31" -> false (November has 30 days)
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // JavaScript "rolls over" bad dates (Nov 31 becomes Dec 1), so compare back.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Money must be a whole number of cents. 12.5 or "1250" are rejected.
export function isCents(value) {
  return Number.isSafeInteger(value);
}

export function isBucket(value) {
  return BUCKETS.includes(value);
}

// Trim a category name; returns null if it is empty or too long.
export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// Notes are optional. Anything missing becomes an empty string.
export function cleanNote(value) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 200) return null;
  return value.trim();
}

// "2026-01" -> "2025-12"
export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
