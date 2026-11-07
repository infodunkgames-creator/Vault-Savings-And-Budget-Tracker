import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { ensureUser, seedDemo } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = openDb();

// First run: create the local user and load clearly-labelled demo data.
if (ensureUser(db, 1) && process.env.VAULT_NO_DEMO !== '1') seedDemo(db, 1);

if (process.env.NODE_ENV === 'production' && !process.env.VAULT_PASSWORD) {
  console.warn('⚠️  VAULT_PASSWORD is not set — anyone who can reach this server can see your data. Set it before going online.');
}

const app = createApp(db, { staticDir: path.resolve(here, '..', 'dist') });
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Vault API listening on http://localhost:${port}`));
