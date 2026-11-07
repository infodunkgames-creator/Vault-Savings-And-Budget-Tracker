import { useState, type ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react';
import type { Category, Cents } from '../lib/types';
import { centsToInput, money, parseMoney } from '../lib/money';

export function Card({ title, sub, action, children, className = '', style }: {
  title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-header">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Up/down indicator. `goodWhenUp=false` flips colors (e.g. spending going up is bad). */
export function Delta({ value, suffix = '%', goodWhenUp = true, label, digits = 1 }: { value: number | null; suffix?: string; goodWhenUp?: boolean; label?: string; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className="stat-delta">— {label}</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="stat-delta">
      <span className={good ? 'up' : 'down'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
        <Icon size={14} />{up ? '+' : '−'}{Math.abs(value).toFixed(digits)}{suffix}
      </span>
      {label}
    </span>
  );
}

export function StatCard({ label, value, delta, accent, title }: { label: string; value: ReactNode; delta?: ReactNode; accent?: boolean; title?: string }) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`} title={title}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{value}</div>
      {delta}
    </div>
  );
}

export function Progress({ value, color = 'var(--green)', lg }: { value: number; color?: string; lg?: boolean }) {
  const w = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100));
  return (
    <div className={`progress${lg ? ' lg' : ''}`} role="progressbar" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={22} /></div>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o} role="tab" aria-selected={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}

export function CategoryBadge({ cat, fallback = 'Uncategorized' }: { cat?: Category | null; fallback?: string }) {
  if (!cat) return <span className="badge badge-gray">{fallback}</span>;
  return <span className="badge" style={{ background: `${cat.color}1f`, color: cat.color }}>{cat.name}</span>;
}
export function CatIcon({ cat, size = 38, income }: { cat?: Category | null; size?: number; income?: boolean }) {
  const color = cat?.color ?? (income ? '#00D9A0' : '#85879D');
  return <div className="tx-icon" style={{ background: `${color}1a`, width: size, height: size }}>{cat?.icon ?? (income ? '💰' : '❔')}</div>;
}
export const DemoBadge = ({ show }: { show: boolean | number }) => (show ? <span className="badge badge-demo" title="Sample data — remove it from Preferences or the banner">DEMO</span> : null);

export function Field({ label, error, hint, children, full, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; full?: boolean; htmlFor?: string }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Money input that keeps the raw text while typing and reports parsed cents. */
export function MoneyInput({ id, value, onChange, invalid, placeholder = '0.00', allowNegative }: {
  id?: string; value: string; onChange: (raw: string) => void; invalid?: boolean; placeholder?: string; allowNegative?: boolean;
}) {
  return (
    <div className="input-prefix">
      <span>$</span>
      <input id={id} className={`input num${invalid ? ' invalid' : ''}`} inputMode="decimal" value={value} placeholder={placeholder}
        onChange={(e) => onChange(allowNegative ? e.target.value : e.target.value.replace(/-/g, ''))}
        onBlur={() => { const c = parseMoney(value); if (c != null) onChange(centsToInput(c)); }} />
    </div>
  );
}

/** Small helper for form state + per-field errors. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const set = <K extends keyof T>(k: K, v: T[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  return { values, set, setValues, errors, setErrors };
}

export function Money({ cents, sign, className = '', whole }: { cents: Cents; sign?: boolean; className?: string; whole?: boolean }) {
  return <span className={`num ${className}`}>{money(cents, { sign, whole })}</span>;
}

export function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 108 }} />)}</div>
      <div className="grid grid-main"><div className="skeleton" style={{ height: 320 }} /><div className="skeleton" style={{ height: 320 }} /></div>
    </div>
  );
}

export const PALETTE = ['#00D9A0', '#4285F4', '#A78BFA', '#F5C451', '#FF5470', '#22D3EE', '#F472B6', '#FB923C', '#34D399', '#85879D'];
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-pick">
      {PALETTE.map((c) => <button type="button" key={c} aria-label={`Color ${c}`} className={value.toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} />)}
    </div>
  );
}
export function EmojiPicker({ value, onChange, options }: { value: string; onChange: (e: string) => void; options: string[] }) {
  return (
    <div className="emoji-pick">
      {options.map((e) => <button type="button" key={e} className={value === e ? 'on' : ''} onClick={() => onChange(e)}>{e}</button>)}
      <input className="input" style={{ width: 70, height: 36 }} value={options.includes(value) ? '' : value} placeholder="Other" maxLength={4}
        onChange={(ev) => ev.target.value && onChange(ev.target.value)} aria-label="Custom emoji" />
    </div>
  );
}
