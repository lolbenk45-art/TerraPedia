const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const resultPath = path.join(repoRoot, 'reports', 'front-probe-result.json');
const cmd = 'pnpm.cmd';
const args = ['run', 'dev'];
const cwd = path.join(repoRoot, 'front');
const port = 5174;
const timeoutMs = 60000;

const child = spawn(cmd, args, { cwd, shell: true });
let logs = '';
let done = false;
const append = (d) => {
  logs += d.toString();
  if (logs.length > 18000) logs = logs.slice(-18000);
};
child.stdout.on('data', append);
child.stderr.on('data', append);

function finish(ok, reason) {
  if (done) return;
  done = true;
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000);
  fs.writeFileSync(resultPath, JSON.stringify({ ok, reason, logs }, null, 2));
  setTimeout(() => process.exit(ok ? 0 : 1), 80);
}

function probePort() {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(800);
    s.once('connect', () => { s.destroy(); resolve(true); });
    const fail = () => { s.destroy(); resolve(false); };
    s.once('error', fail);
    s.once('timeout', fail);
    s.connect(port, '127.0.0.1');
  });
}

function probeApiViaFront() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5174/api/v3/api-docs', (res) => {
      const ok = res.statusCode === 200;
      res.resume();
      resolve(ok);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}

const iv = setInterval(async () => {
  if (done) return clearInterval(iv);
  const p = await probePort();
  if (!p) return;
  const apiOk = await probeApiViaFront();
  if (apiOk) finish(true, 'port-and-api-proxy-ok');
}, 1200);

setTimeout(() => finish(false, 'timeout'), timeoutMs);
child.on('exit', (code) => {
  if (!done) finish(false, `child-exit-${code}`);
});
