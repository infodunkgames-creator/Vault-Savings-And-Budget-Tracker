import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; kind: Kind }
const Ctx = createContext<{ show: (message: string, kind?: Kind) => void } | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback((message: string, kind: Kind = 'success') => {
    const id = nextId++;
    setItems((xs) => [...xs.slice(-3), { id, message, kind }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
  }, [dismiss]);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'success' ? <CheckCircle2 size={18} color="var(--green)" /> : t.kind === 'error' ? <AlertCircle size={18} color="var(--red)" /> : <Info size={18} color="var(--blue)" />}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="icon-btn sm" style={{ border: 0, background: 'transparent' }} onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside provider');
  return c;
}
