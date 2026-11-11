// Money helpers. Money is always a whole number of cents in this app:
// $12.50 is the number 1250. That avoids floating point rounding errors.

// Turn what the user typed into cents, WITHOUT going through a float.
//   "12.50" -> 1250    "12" -> 1200    "$1,234.5" -> 123450
//   "-3" -> -300       ".5" -> 50      "abc" / "1.234" / "" -> null
export function parseMoney(text) {
  if (typeof text !== 'string') return null;

  // Remove spaces, commas and a dollar sign.
  let s = text.trim().replace(/[\s,$]/g, '');

  // A leading minus means a refund.
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }

  // Only digits, optionally a dot and up to two more digits.
  if (!/^\d*(\.\d{0,2})?$/.test(s) || !/\d/.test(s)) return null;

  const [dollars, centsPart = ''] = s.split('.');
  // "5" after the dot means 50 cents, so pad on the right: "5" -> "50".
  const cents = Number(dollars || '0') * 100 + Number((centsPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

// 1250 -> "$12.50"    -300 -> "-$3.00"    123450 -> "$1,234.50"
export function formatMoney(cents) {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}$${dollars}.${rest}`;
}

// 1250 -> "12.50" (for putting a value back into an input box)
export function centsToInput(cents) {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
