// Entry point: "npm start" runs this file after building the web page.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { openDb } from './db.js';
import { createApp } from './app.js';

// The project folder (one level up from server/).
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// All your data lives in this one file.
const DB_FILE = process.env.BUDGET_DB || path.join(projectDir, 'budget.db');
const PORT = Number(process.env.PORT || 4000);
// 127.0.0.1 means "this computer only". Nothing on your network can connect.
const HOST = '127.0.0.1';
const URL_TO_OPEN = `http://${HOST}:${PORT}`;

const db = openDb(DB_FILE);
const app = createApp(db, { staticDir: path.join(projectDir, 'dist') });

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log(`  Budget tracker is running at ${URL_TO_OPEN}`);
  console.log(`  Your data is in ${DB_FILE}`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');
  // The double-click start script sets OPEN_BROWSER=1.
  if (process.env.OPEN_BROWSER === '1') openBrowser(URL_TO_OPEN);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. The app is probably already running:`);
    console.error(`  open ${URL_TO_OPEN} in your browser, or close the other window first.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

// Open the default browser. The command differs per operating system.
function openBrowser(url) {
  const command =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(command, () => {}); // if it fails, the address is still printed above
}
