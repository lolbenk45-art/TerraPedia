const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const cmd = process.env.PNPM_COMMAND || 'pnpm';
const frontProjectDir = process.env.TP_FRONT_PROJECT_DIR || 'front-nuxt';
const port = Number(process.env.TP_FRONT_PORT || '5174');
const args = ['exec', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(port)];
const timeoutMs = 45000;

async function main() {
  const { getProjectRoot } = await import('../../data/lib/project-root.mjs');
  const repoRoot = getProjectRoot();
  const cwd = path.join(repoRoot, frontProjectDir);

  const child = spawn(cmd, args, { cwd, shell: false });
  let logs = '';
  let done = false;

  const append = (d) => {
    logs += d.toString();
    if (logs.length > 8000) logs = logs.slice(-8000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  function finish(ok, reason) {
    if (done) return;
    done = true;
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 500);
    console.log(`FRONT_OK=${ok} REASON=${reason}`);
    console.log(logs.trim());
    process.exit(ok ? 0 : 1);
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
