// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF) + column auto-detection.
import { parseMoney } from './money';
import { isValidISODate, pad } from './dates';

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YY, DD.MM.YYYY. Returns ISO or null. */
export function parseDateFlexible(s: string): string | null {
  const v = s.trim();
  if (isValidISODate(v)) return v;
  let m = v.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (m) { const iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`; return isValidISODate(iso) ? iso : null; }
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) { const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; return isValidISODate(iso) ? iso : null; }
  return null;
}

export interface ColumnMap { date: number; description: number; amount: number; debit: number; credit: number; type: number; category: number; notes: number }
export function guessColumns(header: string[]): ColumnMap {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)));
  return {
    date: find('date', 'posted'),
    description: find('description', 'merchant', 'payee', 'name', 'memo'),
    amount: h.findIndex((x) => x === 'amount' || x.includes('amount')),
    debit: find('debit', 'withdrawal'),
    credit: find('credit', 'deposit'),
    type: h.findIndex((x) => x === 'type' || x === 'transaction type'),
    category: find('category'),
    notes: find('notes', 'note'),
  };
}

export interface ImportRow { date: string; description: string; amount: number; type: 'income' | 'expense'; category?: string; notes?: string }
export interface RowResult { ok: boolean; row?: ImportRow; error?: string; line: number }

/** Convert raw CSV rows into transactions. Signed amounts: negative = expense unless a Type column says otherwise. */
export function mapRows(rows: string[][], map: ColumnMap): RowResult[] {
  return rows.map((r, i) => {
    const line = i + 2;
    const date = map.date >= 0 ? parseDateFlexible(r[map.date] ?? '') : null;
    if (!date) return { ok: false, line, error: 'Unrecognized date' };
    const description = (map.description >= 0 ? r[map.description] : '')?.trim();
    if (!description) return { ok: false, line, error: 'Missing description' };
    let cents: number | null = null;
    let type: 'income' | 'expense' | null = null;
    if (map.amount >= 0 && (r[map.amount] ?? '').trim()) cents = parseMoney(r[map.amount]);
    else {
      const debit = map.debit >= 0 ? parseMoney(r[map.debit] ?? '') : null;
      const credit = map.credit >= 0 ? parseMoney(r[map.credit] ?? '') : null;
      if (debit) { cents = -Math.abs(debit); }
      else if (credit) { cents = Math.abs(credit); }
    }
    if (cents == null || cents === 0) return { ok: false, line, error: 'Missing or invalid amount' };
    const t = map.type >= 0 ? (r[map.type] ?? '').trim().toLowerCase() : '';
    if (['income', 'credit', 'deposit'].includes(t)) type = 'income';
    else if (['expense', 'debit', 'withdrawal', 'payment'].includes(t)) type = 'expense';
    else type = cents < 0 ? 'expense' : 'income';
    return {
      ok: true, line,
      row: {
        date, description: description.slice(0, 120), amount: Math.abs(cents), type,
        category: map.category >= 0 ? r[map.category]?.trim() : undefined,
        notes: map.notes >= 0 ? r[map.notes]?.trim() || undefined : undefined,
      },
    };
  });
}
