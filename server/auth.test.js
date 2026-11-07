import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb } from './db.js';
import { createApp } from './app.js';

let server; let base;
beforeEach(async () => {
  const app = createApp(openDb(':memory:'), { password: 'correct horse' });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => new Promise((r) => server.close(r)));
const login = (password) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });

describe('password gate', () => {
  it('blocks data without a session but leaves health open', async () => {
    expect((await fetch(`${base}/api/state`)).status).toBe(401);
    expect((await fetch(`${base}/api/export`)).status).toBe(401);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect(await (await fetch(`${base}/api/auth/status`)).json()).toEqual({ required: true, authenticated: false });
  });
  it('rejects a wrong password and accepts the right one', async () => {
    expect((await login('nope')).status).toBe(401);
    const ok = await login('correct horse');
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    expect(ok.headers.get('set-cookie')).toContain('HttpOnly');
    expect((await fetch(`${base}/api/state`, { headers: { cookie } })).status).toBe(200);
  });
  it('rejects tampered cookies', async () => {
    const exp = Date.now() + 1e9;
    expect((await fetch(`${base}/api/state`, { headers: { cookie: `vault_session=${exp}.forged` } })).status).toBe(401);
  });
  it('locks out after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await login('bad');
    expect((await login('correct horse')).status).toBe(429);
  });
});
