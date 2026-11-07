import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppState } from '../lib/types';
import { setCurrency } from '../lib/money';
import { useToast } from '../components/Toast';

interface DataCtx {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  /** True when the server requires a password and this browser isn't signed in. */
  needsLogin: boolean;
  reload: () => Promise<void>;
  /** Run a mutation, then refresh state so every page stays consistent. Shows a toast on success/failure. */
  run: <T>(fn: () => Promise<T>, success?: string | ((r: T) => string)) => Promise<T | undefined>;
}
const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const toast = useToast();
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const s = await api.get<AppState>('/api/state');
      if (mine !== seq.current) return; // a newer reload superseded this one
      setCurrency(s.settings.preferences.currency, s.settings.preferences.locale);
      setState(s);
      setError(null);
      setNeedsLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setNeedsLogin(true); setState(null); return; }
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const run = useCallback<DataCtx['run']>(async (fn, success) => {
    try {
      const r = await fn();
      await reload();
      if (success) toast.show(typeof success === 'function' ? success(r) : success, 'success');
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setNeedsLogin(true); setState(null); throw e; }
      toast.show(e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong', 'error');
      throw e;
    }
  }, [reload, toast]);

  const value = useMemo(() => ({ state, loading, error, needsLogin, reload, run }), [state, loading, error, needsLogin, reload, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useData outside provider');
  return c;
}
/** Convenience for pages rendered only after state has loaded. */
export function useAppState(): AppState {
  const { state } = useData();
  if (!state) throw new Error('State not loaded');
  return state;
}
