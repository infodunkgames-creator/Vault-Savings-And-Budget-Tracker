// "npm run dev": for when you are changing the code.
// Starts the API server (restarts when server files change) and the Vite
// dev server (updates the page instantly when src files change).
// Open http://localhost:5173 while this is running.
import { spawn } from 'node:child_process';

const commands = [
  'node --watch server/index.js',
  'npx vite',
];

// shell: true lets the same command line work on Windows, macOS and Linux.
const children = commands.map((command) => spawn(command, { stdio: 'inherit', shell: true }));

// When one stops (or you press Ctrl+C), stop the other too.
for (const child of children) {
  child.on('exit', () => {
    for (const other of children) other.kill();
    process.exit();
  });
}
