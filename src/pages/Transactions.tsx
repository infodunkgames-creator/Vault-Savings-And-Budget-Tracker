import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Upload, Download, ArrowUpDown, ArrowLeftRight, Repeat, X, FileUp } from 'lucide-react';
import { useAppState, useData } from '../store/DataContext';
import { Card, CatIcon, CategoryBadge, DemoBadge, Empty } from '../components/ui';
import { TransactionModal } from '../components/TransactionForm';
import { Modal, useConfirm } from '../components/Modal';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { addDays, dateLabel, FREQUENCY_LABEL, monthEnd, monthStart, time12 } from '../lib/dates';
import type { Transaction } from '../lib/types';
import { guessColumns, mapRows, parseCSV, type ColumnMap, type RowResult } from '../lib/csv';

type SortKey = 'date' | 'amount' | 'description';
const PAGE = 50;

export function Transactions() {
  const state = useAppState();
  const { run } = useData();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [type, setType] = useState<'all' | 'income' | 'expense'>((params.get('type') as 'income') ?? 'all');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const month = params.get('month');
  const [from, setFrom] = useState(month ? monthStart(month) : params.get('from') ?? '');
  const [to, setTo] = useState(month ? monthEnd(month) : params.get('to') ?? '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => { setQ(params.get('q') ?? ''); }, [params]);
  useEffect(() => { setPage(0); }, [q, type, category, from, to, sort]);

  const catById = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);
  const acctById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = state.transactions.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (category === 'none' ? t.category_id != null : category && String(t.category_id) !== category) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (needle) {
        const hay = `${t.description} ${t.notes ?? ''} ${catById.get(t.category_id ?? -1)?.name ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const signed = (t: Transaction) => (t.type === 'income' ? t.amount : -t.amount);
    return list.sort((a, b) => {
      let c = 0;
      if (sort.key === 'date') c = a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id - b.id;
      else if (sort.key === 'amount') c = Math.abs(signed(a)) - Math.abs(signed(b));
      else c = a.description.localeCompare(b.description);
      return c * sort.dir;
    });
  }, [state.transactions, q, type, category, from, to, sort, catById]);

  const sums = useMemo(() => filtered.reduce((s, t) => (t.type === 'income' ? { ...s, income: s.income + t.amount } : { ...s, expense: s.expense + t.amount }), { income: 0, expense: 0 }), [filtered]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const hasFilters = q || type !== 'all' || category || from || to;

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'description' ? 1 : -1 }));
  const clearFilters = () => { setQ(''); setType('all'); setCategory(''); setFrom(''); setTo(''); setParams({}); };
  const preset = (days: number | 'month' | 'lastMonth') => {
    const today = state.today;
    if (days === 'month') { setFrom(monthStart(today.slice(0, 7))); setTo(today); return; }
    if (days === 'lastMonth') {
      const lm = addDays(monthStart(today.slice(0, 7)), -1).slice(0, 7);
      setFrom(monthStart(lm)); setTo(monthEnd(lm)); return;
    }
    setFrom(addDays(today, -days + 1)); setTo(today);
  };

  const del = async (t: Transaction) => {
    const linked = state.billPayments.some((p) => p.transaction_id === t.id) || state.debtPayments.some((p) => p.transaction_id === t.id);
    if (!(await confirm({ title: 'Delete transaction?', message: <>“{t.description}” ({money(t.amount)}) will be permanently deleted{t.account_id ? ' and its linked account balance adjusted' : ''}.{linked && ' The related bill/debt payment record will be kept.'}</> }))) return;
    await run(() => api.del(`/api/transactions/${t.id}`), 'Transaction deleted');
    setSelected((s) => { const n = new Set(s); n.delete(t.id); return n; });
  };
  const bulkDelete = async () => {
    if (!(await confirm({ title: `Delete ${selected.size} transactions?`, message: 'The selected transactions will be permanently deleted and linked account balances adjusted.' }))) return;
    await run(() => api.post<{ deleted: number }>('/api/transactions/bulk-delete', { ids: [...selected] }), (r) => `${r.deleted} transactions deleted`);
    setSelected(new Set());
  };
  const allOnPage = pageRows.length > 0 && pageRows.every((t) => selected.has(t.id));

  return (
    <div>
      <div className="page-head">
        <div><h2>Transactions</h2><p>Every income and expense you've recorded. Changes update budgets, charts and reports instantly.</p></div>
        <div className="row-wrap">
          <a className="btn" href="/api/export/transactions.csv" download><Download size={15} />Export CSV</a>
          <button className="btn" onClick={() => setImportOpen(true)}><Upload size={15} />Import CSV</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} />Add transaction</button>
        </div>
      </div>

      <Card>
        <div className="row-wrap" style={{ marginBottom: 12 }}>
          <div className="search" style={{ flex: '1 1 240px' }}>
            <Search size={15} />
            <input className="input" placeholder="Search description, notes, category…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
          </div>
          <select className="input" style={{ width: 140 }} value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type">
            <option value="all">All types</option><option value="income">Income</option><option value="expense">Expenses</option>
          </select>
          <select className="input" style={{ width: 210 }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            <optgroup label="Expenses">{state.categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="Income">{state.categories.filter((c) => c.kind === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </select>
        </div>
        <div className="row-wrap" style={{ marginBottom: 14 }}>
          <input type="date" className="input" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="muted">to</span>
          <input type="date" className="input" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <button className="btn btn-sm btn-ghost" onClick={() => preset(7)}>7 days</button>
          <button className="btn btn-sm btn-ghost" onClick={() => preset(30)}>30 days</button>
          <button className="btn btn-sm btn-ghost" onClick={() => preset('month')}>This month</button>
          <button className="btn btn-sm btn-ghost" onClick={() => preset('lastMonth')}>Last month</button>
          {hasFilters && <button className="btn btn-sm" onClick={clearFilters}><X size={13} />Clear filters</button>}
        </div>

        <div className="row-wrap small" style={{ marginBottom: 6, gap: 18 }}>
          <span className="muted"><b style={{ color: 'var(--text)' }}>{filtered.length}</b> transactions</span>
          <span className="muted">Income <b className="pos num">{money(sums.income)}</b></span>
          <span className="muted">Expenses <b className="neg num">{money(sums.expense)}</b></span>
          <span className="muted">Net <b className={`num ${sums.income - sums.expense >= 0 ? 'pos' : 'neg'}`}>{money(sums.income - sums.expense, { sign: true })}</b></span>
          <span className="spacer" />
          {selected.size > 0 && <button className="btn btn-danger btn-sm" onClick={bulkDelete}><Trash2 size={13} />Delete {selected.size} selected</button>}
        </div>

        {filtered.length === 0 ? (
          state.transactions.length === 0
            ? <Empty icon={ArrowLeftRight} title="No transactions yet" text="Add your first income or expense, or import a CSV export from your bank." action={<button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}><Plus size={14} />Add transaction</button>} />
            : <Empty icon={Search} title="No matches" text="No transactions match these filters." action={<button className="btn btn-sm" onClick={clearFilters}>Clear filters</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}><input type="checkbox" aria-label="Select page" checked={allOnPage} onChange={() => setSelected((s) => { const n = new Set(s); pageRows.forEach((t) => (allOnPage ? n.delete(t.id) : n.add(t.id))); return n; })} /></th>
                  <th className="sortable" onClick={() => toggleSort('description')}>Description <ArrowUpDown size={11} /></th>
                  <th className="hide-sm">Category</th>
                  <th className="sortable" onClick={() => toggleSort('date')}>Date <ArrowUpDown size={11} /></th>
                  <th className="hide-md">Account</th>
                  <th className="sortable right" onClick={() => toggleSort('amount')}>Amount <ArrowUpDown size={11} /></th>
                  <th style={{ width: 76 }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const cat = catById.get(t.category_id ?? -1);
                  return (
                    <tr key={t.id}>
                      <td><input type="checkbox" aria-label={`Select ${t.description}`} checked={selected.has(t.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} /></td>
                      <td style={{ maxWidth: 320 }}>
                        <div className="row" style={{ gap: 10 }}>
                          <CatIcon cat={cat} size={32} income={t.type === 'income'} />
                          <div className="tx-main">
                            <div className="tx-title">{t.description} <DemoBadge show={t.is_demo} /></div>
                            <div className="tx-meta">
                              {t.recurring && <><Repeat size={10} /> {FREQUENCY_LABEL[t.recurring]} · </>}
                              {t.import_hash && 'Imported · '}
                              {t.notes ?? (t.type === 'income' ? 'Income' : 'Expense')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hide-sm"><CategoryBadge cat={cat} /></td>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>{dateLabel(t.date, { year: true })}<div className="tiny muted">{time12(t.time)}</div></td>
                      <td className="hide-md small muted">{t.account_id ? acctById.get(t.account_id)?.name : '—'}</td>
                      <td className={`right bold num ${t.type === 'income' ? 'pos' : 'neg'}`} style={{ whiteSpace: 'nowrap' }}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</td>
                      <td>
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button className="icon-btn sm" onClick={() => { setEditing(t); setFormOpen(true); }} aria-label={`Edit ${t.description}`}><Pencil size={13} /></button>
                          <button className="icon-btn sm" onClick={() => del(t)} aria-label={`Delete ${t.description}`}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="small muted">Page {page + 1} of {pages}</span>
            <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </Card>

      <TransactionModal open={formOpen} onClose={() => setFormOpen(false)} initial={editing} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

const COLS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: 'date', label: 'Date', required: true }, { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount (signed)' }, { key: 'debit', label: 'Debit / withdrawal' }, { key: 'credit', label: 'Credit / deposit' },
  { key: 'type', label: 'Type (income/expense)' }, { key: 'category', label: 'Category' }, { key: 'notes', label: 'Notes' },
];

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAppState();
  const { run } = useData();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: { row: number; message: string }[] } | null>(null);

  const reset = () => { setFileName(''); setRows([]); setMap(null); setResult(null); setError(''); setAccount(''); };
  const close = () => { reset(); onClose(); };
  const header = rows[0] ?? [];
  const mapped: RowResult[] = useMemo(() => (map ? mapRows(rows.slice(1), map) : []), [rows, map]);
  const ok = mapped.filter((r) => r.ok);
  const bad = mapped.filter((r) => !r.ok);

  const onFile = async (f: File | undefined) => {
    setError(''); setResult(null);
    if (!f) return;
    if (f.size > 5_000_000) return setError('File is larger than 5 MB.');
    const text = await f.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) return setError('That file has no data rows.');
    setFileName(f.name);
    setRows(parsed);
    setMap(guessColumns(parsed[0]));
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await run(() => api.post<typeof result>('/api/import/transactions', { rows: ok.map((x) => x.row), account_id: account ? Number(account) : null }),
        (x) => `Imported ${x!.imported} transactions${x!.duplicates ? ` · ${x!.duplicates} duplicates skipped` : ''}`);
      if (r) setResult(r);
    } finally { setBusy(false); }
  };
  const mapValid = map && map.date >= 0 && map.description >= 0 && (map.amount >= 0 || map.debit >= 0 || map.credit >= 0);

  return (
    <Modal open={open} onClose={close} title="Import transactions from CSV" wide
      footer={result ? <button className="btn btn-primary" onClick={close}>Done</button> : <>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={!mapValid || ok.length === 0 || busy} onClick={doImport}>{busy ? 'Importing…' : `Import ${ok.length} rows`}</button>
      </>}>
      {result ? (
        <div className="stack">
          <div className="grid grid-3">
            <div className="stat"><div className="stat-label">Imported</div><div className="stat-value pos">{result.imported}</div></div>
            <div className="stat"><div className="stat-label">Duplicates skipped</div><div className="stat-value">{result.duplicates}</div></div>
            <div className="stat"><div className="stat-label">Rejected</div><div className="stat-value neg">{result.errors.length + bad.length}</div></div>
          </div>
          {result.errors.map((e) => <div key={e.row} className="small neg">Row {e.row}: {e.message}</div>)}
        </div>
      ) : (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            Upload a CSV exported from your bank or from Vault. Needs a date, a description and either a signed amount (negative = expense) or separate debit/credit columns.
            Rows already in Vault are detected and skipped, so re-importing the same file never creates duplicates.
          </p>
          <label className="btn" style={{ alignSelf: 'flex-start' }}>
            <FileUp size={15} />{fileName || 'Choose CSV file'}
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {error && <div className="neg small">{error}</div>}
          {map && (
            <>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {COLS.map((c) => (
                  <div className="field" key={c.key}>
                    <label>{c.label}{c.required && ' *'}</label>
                    <select className="input" value={map[c.key]} onChange={(e) => setMap({ ...map, [c.key]: Number(e.target.value) })}>
                      <option value={-1}>— none —</option>
                      {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                ))}
                <div className="field">
                  <label>Into account</label>
                  <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">No account</option>
                    {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              {!mapValid && <div className="small neg">Map the date, description, and an amount column to continue.</div>}
              <div className="small"><b className="pos">{ok.length}</b> rows ready{bad.length > 0 && <> · <b className="neg">{bad.length}</b> will be skipped</>}</div>
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Line</th><th>Date</th><th>Description</th><th>Category</th><th className="right">Amount</th></tr></thead>
                  <tbody>
                    {mapped.slice(0, 50).map((r) => (
                      <tr key={r.line}>
                        <td className="muted small">{r.line}</td>
                        {r.ok && r.row ? (<>
                          <td className="small">{r.row.date}</td><td className="small">{r.row.description}</td><td className="small muted">{r.row.category ?? '—'}</td>
                          <td className={`right small bold num ${r.row.type === 'income' ? 'pos' : 'neg'}`}>{r.row.type === 'income' ? '+' : '−'}{money(r.row.amount)}</td>
                        </>) : <td colSpan={4} className="small neg">{r.error}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
