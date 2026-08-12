import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const children = [];
let stopping = false;

function run(label, command, args, cwd = process.cwd()) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
  });
  children.push(child);
  child.once('exit', code => {
    if (!stopping && code) {
      console.error(`${label} terminó con código ${code}.`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 350);
}

console.log('');
console.log('CanalBot local');
console.log('Panel: http://localhost:3000');
console.log('API:   http://127.0.0.1:3210/api/v1/status');
console.log('Modo seguro: no se enviarán mensajes ni publicaciones.');
console.log('');

run('CanalBot', process.execPath, ['scripts/start-local.js']);
run('Dashboard', process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], path.join(process.cwd(), 'dashboard'));

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
