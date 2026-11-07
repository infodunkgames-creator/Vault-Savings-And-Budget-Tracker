import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export function Login({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError('Enter your password');
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/login', { password });
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="card" onSubmit={submit} style={{ width: '100%', maxWidth: 380 }} noValidate>
        <div className="brand" style={{ padding: '0 0 18px' }}><div className="brand-mark">V</div>Vault</div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Welcome back</h2>
        <p className="muted small" style={{ marginTop: 0 }}>Enter your Vault password to see your finances.</p>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="login-pw">Password</label>
          <input id="login-pw" type="password" autoComplete="current-password" autoFocus className={`input${error ? ' invalid' : ''}`}
            value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          {error && <span className="err">{error}</span>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}><Lock size={15} />{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
