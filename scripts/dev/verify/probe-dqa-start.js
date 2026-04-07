const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const resultPath = path.join(repoRoot, 'reports', 'dqa-probe-result.json');
const cmd = 'pnpm.cmd';
const args = ['run', 'dev', '--', '--port', '3001', '--host', '127.0.0.1'];
const cwd = path.join(repoRoot, 'data-query-app');
const port = 3001;
const timeoutMs = 60000;

const child = spawn(cmd, args, { cwd, shell: true });
let logs = '';
let done = false;

const append = (d) => {
  logs += d.toString();
  if (logs.length > 16000) logs = logs.slice(-16000);
};
child.stdout.on('data', append);
child.stderr.on('data', append);

function finish(ok, reason) {
  if (done) return;
  done = true;
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 500);
  fs.writeFileSync(resultPath, JSON.stringify({ ok, reason, logs }, null, 2));
  setTimeout(() => process.exit(ok ? 0 : 1), 80);
}

function probe() {
  const s = new net.Socket();
  s.setTimeout(800);
  s.once('connect', () => { s.destroy(); finish(true, 'port-open'); });
  const fail = () => { s.destroy(); };
  s.once('error', fail);
  s.once('timeout', fail);
  s.connect(port, '127.0.0.1');
}

const iv = setInterval(() => {
  if (done) return clearInterval(iv);
  probe();
}, 700);

setTimeout(() => finish(false, 'timeout'), timeoutMs);
child.on('exit', (code) => {
  if (!done) finish(false, `child-exit-${code}`);
});
