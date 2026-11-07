// Runs the API server and the Vite dev server together.
import { spawn } from 'node:child_process';
const run = (script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
const procs = [run('dev:server'), run('dev:client')];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) stop(); }));
