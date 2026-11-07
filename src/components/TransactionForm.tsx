import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Field, MoneyInput } from './ui';
import { useAppState, useData } from '../store/DataContext';
import { api, ApiError } from '../lib/api';
import type { Frequency, Transaction, TxType } from '../lib/types';
import { centsToInput, parseMoney } from '../lib/money';
import { FREQUENCY_LABEL, isValidISODate } from '../lib/dates';

interface Props { open: boolean; onClose: () => void; initial?: Transaction | null; defaultType?: TxType }

const blank = (today: string, type: TxType) => ({
  type, description: '', amount: '', category_id: '', account_id: '', income_source_id: '', date: today, time: '', notes: '', recurring: '' as Frequency | '',
});

export function TransactionModal({ open, onClose, initial, defaultType = 'expense' }: Props) {
  const state = useAppState();
  const { run } = useData();
  const [v, setV] = useState(blank(state.today, defaultType));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setV({
        type: initial.type, description: initial.description, amount: centsToInput(initial.amount),
        category_id: initial.category_id ? String(initial.category_id) : '', account_id: initial.account_id ? String(initial.account_id) : '',
        income_source_id: initial.income_source_id ? String(initial.income_source_id) : '', date: initial.date, time: initial.time ?? '',
        notes: initial.notes ?? '', recurring: initial.recurring ?? '',
      });
    } else {
      const firstAvail = state.accounts.find((a) => a.include_in_available);
      setV({ ...blank(state.today, defaultType), account_id: firstAvail ? String(firstAvail.id) : '' });
    }
  }, [open, initial, defaultType, state.today, state.accounts]);

  const set = (k: keyof typeof v, val: string) => { setV((s) => ({ ...s, [k]: val })); setErrors((e) => ({ ...e, [k]: '' })); };
  const cats = state.categories.filter((c) => c.kind === v.type);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const amount = parseMoney(v.amount);
    if (!v.description.trim()) errs.description = 'Enter a description';
    if (amount == null || amount <= 0) errs.amount = 'Enter an amount greater than zero';
    if (!isValidISODate(v.date)) errs.date = 'Choose a valid date';
    if (Object.keys(errs).length) return setErrors(errs);
    const body = {
      type: v.type, description: v.description.trim(), amount, date: v.date, time: v.time || null, notes: v.notes.trim() || null,
      category_id: v.category_id ? Number(v.category_id) : null, account_id: v.account_id ? Number(v.account_id) : null,
      income_source_id: v.type === 'income' && v.income_source_id ? Number(v.income_source_id) : null, recurring: v.recurring || null,
    };
    setSaving(true);
    try {
      if (initial) await run(() => api.put(`/api/transactions/${initial.id}`, body), 'Transaction updated');
      else await run(() => api.post('/api/transactions', body), v.type === 'income' ? 'Income added' : 'Expense added');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit transaction' : 'Add transaction'}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="tx-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Add transaction'}</button>
      </>}>
      <form id="tx-form" className="form" onSubmit={submit} noValidate>
        <div className="toggle-group" role="radiogroup" aria-label="Transaction type">
          {(['expense', 'income'] as const).map((t) => (
            <button type="button" key={t} role="radio" aria-checked={v.type === t} className={v.type === t ? `on-${t}` : ''}
              onClick={() => setV((s) => ({ ...s, type: t, category_id: s.type === t ? s.category_id : '', income_source_id: '' }))}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Description" error={errors.description} full htmlFor="tx-desc">
            <input id="tx-desc" className={`input${errors.description ? ' invalid' : ''}`} value={v.description} maxLength={120} placeholder={v.type === 'expense' ? 'e.g. Whole Foods Market' : 'e.g. Salary deposit'} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Amount" error={errors.amount} htmlFor="tx-amount">
            <MoneyInput id="tx-amount" value={v.amount} invalid={!!errors.amount} onChange={(x) => set('amount', x)} />
          </Field>
          <Field label="Category" error={errors.category_id} htmlFor="tx-cat">
            <select id="tx-cat" className="input" value={v.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Uncategorized</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>
          <Field label="Date" error={errors.date} htmlFor="tx-date">
            <input id="tx-date" type="date" className={`input${errors.date ? ' invalid' : ''}`} value={v.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Time (optional)" htmlFor="tx-time">
            <input id="tx-time" type="time" className="input" value={v.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
          <Field label="Account" hint="Linked account balances update automatically" htmlFor="tx-acct">
            <select id="tx-acct" className="input" value={v.account_id} onChange={(e) => set('account_id', e.target.value)}>
              <option value="">No account</option>
              {state.accounts.filter((a) => ['checking', 'savings', 'cash', 'credit_card'].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {v.type === 'income' ? (
            <Field label="Income source" htmlFor="tx-src">
              <select id="tx-src" className="input" value={v.income_source_id} onChange={(e) => set('income_source_id', e.target.value)}>
                <option value="">Not linked</option>
                {state.incomeSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Repeats" hint="Shows future occurrences on the calendar" htmlFor="tx-rec">
              <select id="tx-rec" className="input" value={v.recurring} onChange={(e) => set('recurring', e.target.value)}>
                <option value="">Does not repeat</option>
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).filter((f) => f !== 'once').map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
              </select>
            </Field>
          )}
          {v.type === 'income' && (
            <Field label="Repeats" htmlFor="tx-rec2">
              <select id="tx-rec2" className="input" value={v.recurring} onChange={(e) => set('recurring', e.target.value)}>
                <option value="">Does not repeat</option>
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).filter((f) => f !== 'once').map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes (optional)" full htmlFor="tx-notes">
            <textarea id="tx-notes" className="input" value={v.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
