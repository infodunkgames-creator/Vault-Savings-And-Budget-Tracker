// Password gate for hosted deployments. Enabled only when VAULT_PASSWORD is set.
// Sessions are stateless signed cookies: `<expiry>.<hmac>`; changing the password or
// VAULT_SESSION_SECRET invalidates every existing session.
import crypto from 'node:crypto';

const COOKIE = 'vault_session';
const MAX_AGE_DAYS = 30;

export function createAuth({ password, secret }) {
  const enabled = Boolean(password);
  const key = crypto.createHash('sha256').update(`${secret ?? ''}|${password ?? ''}|vault-session-v1`).digest();
  const sign = (exp) => crypto.createHmac('sha256', key).update(String(exp)).digest('base64url');
  const attempts = new Map(); // ip -> { count, until }

  const readCookie = (req) => {
    const raw = req.headers.cookie ?? '';
    for (const part of raw.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return decodeURIComponent(v.join('='));
    }
    return null;
  };
  const valid = (token) => {
    if (!token) return false;
    const [exp, sig] = token.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const expected = sign(exp);
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  };
  const cookieFlags = (req) => `Path=/; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`;

  return {
    enabled,
    /** Blocks /api requests without a valid session (health + auth routes stay open). */
    middleware(req, res, next) {
      if (!enabled || req.path === '/health' || req.path.startsWith('/auth/')) return next();
      if (valid(readCookie(req))) return next();
      res.status(401).json({ error: 'Please sign in' });
    },
    status(req, res) {
      res.json({ required: enabled, authenticated: !enabled || valid(readCookie(req)) });
    },
    login(req, res) {
      if (!enabled) return res.json({ ok: true });
      const ip = req.ip ?? 'unknown';
      const a = attempts.get(ip);
      if (a && a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
      const given = Buffer.from(crypto.createHash('sha256').update(String(req.body?.password ?? '')).digest());
      const real = Buffer.from(crypto.createHash('sha256').update(password).digest());
      if (!crypto.timingSafeEqual(given, real)) {
        const count = (a?.count ?? 0) + 1;
        attempts.set(ip, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 });
        return res.status(401).json({ error: 'Incorrect password' });
      }
      attempts.delete(ip);
      const exp = Date.now() + MAX_AGE_DAYS * 86400_000;
      res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Max-Age=${MAX_AGE_DAYS * 86400}; ${cookieFlags(req)}`);
      res.json({ ok: true });
    },
    logout(req, res) {
      res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieFlags(req)}`);
      res.json({ ok: true });
    },
  };
}
