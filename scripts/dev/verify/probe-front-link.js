const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

const cmd = process.env.PNPM_COMMAND || 'pnpm';
const frontProjectDir = process.env.TP_FRONT_PROJECT_DIR || 'front-nuxt';
const port = Number(process.env.TP_FRONT_PORT || '5174');
const args = ['exec', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(port)];
const timeoutMs = 60000;

async function main() {
  const { getProjectRoot } = await import('../../data/lib/project-root.mjs');
  const repoRoot = getProjectRoot();
  const resultPath = path.join(repoRoot, 'reports', 'front-probe-result.json');
  const cwd = path.join(repoRoot, frontProjectDir);

  const child = spawn(cmd, args, { cwd, shell: false });
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
      const req = http.get(`http://127.0.0.1:${port}/api/v3/api-docs`, (res) => {
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
