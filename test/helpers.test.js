// Tests for the small money and date helpers. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, centsToInput } from '../src/money.js';
import { addMonths, isMonth } from '../src/dates.js';
import { isDate, previousMonth } from '../server/validate.js';

test('parseMoney turns typed text into whole cents', () => {
  assert.equal(parseMoney('12.50'), 1250);
  assert.equal(parseMoney('12'), 1200);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('.5'), 50);
  assert.equal(parseMoney('$1,234.56'), 123456);
  assert.equal(parseMoney('-3'), -300);
  // Classic float traps: these must be exact.
  assert.equal(parseMoney('0.29'), 29);
  assert.equal(parseMoney('19.99'), 1999);
  assert.equal(parseMoney('1.10'), 110);
});

test('parseMoney rejects things that are not money', () => {
  for (const bad of ['', '.', '-', 'abc', '1.234', '1..2', '1-2', '12e3']) {
    assert.equal(parseMoney(bad), null, `"${bad}" should be rejected`);
  }
});

test('formatMoney and centsToInput', () => {
  assert.equal(formatMoney(1250), '$12.50');
  assert.equal(formatMoney(5), '$0.05');
  assert.equal(formatMoney(-300), '-$3.00');
  assert.equal(formatMoney(123456), '$1,234.56');
  assert.equal(centsToInput(1250), '12.50');
  assert.equal(centsToInput(-5), '-0.05');
});

test('month math crosses year boundaries', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-06', 0), '2026-06');
  assert.equal(previousMonth('2026-01'), '2025-12');
  assert.equal(previousMonth('2026-11'), '2026-10');
  assert.equal(isMonth('2026-13'), false);
});

test('isDate only accepts real calendar dates', () => {
  assert.equal(isDate('2026-11-30'), true);
  assert.equal(isDate('2026-11-31'), false);
  assert.equal(isDate('2028-02-29'), true); // leap year
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('11/30/2026'), false);
});
