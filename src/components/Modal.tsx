import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button.btn-primary');
    setTimeout(() => first?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={ref}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---- Promise-based confirmation dialog for destructive actions ------------------------------
interface ConfirmOpts { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; requireText?: string }
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setTyped('');
    setOpts(o);
  }), []);
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };
  const blocked = Boolean(opts?.requireText && typed !== opts.requireText);
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} title={<span className="row">{opts?.danger !== false && <AlertTriangle size={18} color="var(--red)" />}{opts?.title}</span>}
        footer={<>
          <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button className={`btn ${opts?.danger === false ? 'btn-primary' : 'btn-danger'}`} disabled={blocked} onClick={() => close(true)}>{opts?.confirmLabel ?? 'Delete'}</button>
        </>}>
        <div className="muted" style={{ fontSize: 13.5 }}>{opts?.message}</div>
        {opts?.requireText && (
          <div className="field mt-16">
            <label htmlFor="confirm-text">Type <b style={{ color: 'var(--text)' }}>{opts.requireText}</b> to confirm</label>
            <input id="confirm-text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm outside provider');
  return c;
}
