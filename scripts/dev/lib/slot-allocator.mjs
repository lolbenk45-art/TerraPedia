import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assignSlot(registry, worktreePath) {
  if (Object.prototype.hasOwnProperty.call(registry, worktreePath)) {
    return { slot: registry[worktreePath], registry };
  }
  const used = new Set(Object.values(registry));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return { slot, registry: { ...registry, [worktreePath]: slot } };
}

function readRegistry(registryPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(registryPath, fn) {
  const lockPath = `${registryPath}.lock`;
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const deadline = Date.now() + 5000;
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() > deadline) {
        throw new Error(`Timed out acquiring slot registry lock: ${lockPath}`);
      }
      sleepSync(50);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

function main() {
  const [registryPath, worktreePath] = process.argv.slice(2);
  if (!registryPath || !worktreePath) {
    process.stderr.write('usage: slot-allocator.mjs <registryPath> <worktreePath>\n');
    process.exit(2);
  }
  const slot = withLock(registryPath, () => {
    const registry = readRegistry(registryPath);
    const { slot, registry: next } = assignSlot(registry, worktreePath);
    const tmp = `${registryPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(tmp, registryPath);
    return slot;
  });
  process.stdout.write(String(slot));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
