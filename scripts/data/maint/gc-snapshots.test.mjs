import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildSnapshotGcPlan,
  runSnapshotGc
} from './gc-snapshots.mjs';

test('snapshot GC keeps the 7 newest timestamp snapshots per entity stem', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-snapshot-gc-'));
  const rawDir = path.join(tempDir, 'raw', 'wiki');
  fs.mkdirSync(rawDir, { recursive: true });

  for (let index = 1; index <= 20; index += 1) {
    const day = String(index).padStart(2, '0');
    fs.writeFileSync(
      path.join(rawDir, `module__iteminfo__data.2026-05-${day}T00-00-00.000Z.json`),
      `{"day":${index}}\n`,
      'utf8'
    );
  }
  fs.writeFileSync(path.join(rawDir, 'module__iteminfo__data.latest.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(rawDir, 'module__npcinfo__data.2026-05-01T00-00-00.000Z.json'), '{}\n', 'utf8');

  const plan = buildSnapshotGcPlan({ roots: [rawDir], keep: 7 });
  assert.equal(plan.deleteFiles.length, 13);
  assert.equal(plan.keepFiles.filter((filePath) => path.basename(filePath).startsWith('module__iteminfo__data.')).length, 7);

  const result = runSnapshotGc({ roots: [rawDir], keep: 7 });
  assert.equal(result.deleted, 13);

  const remaining = fs.readdirSync(rawDir).sort();
  assert.equal(remaining.includes('module__iteminfo__data.latest.json'), true);
  assert.equal(remaining.includes('module__npcinfo__data.2026-05-01T00-00-00.000Z.json'), true);
  assert.deepEqual(
    remaining.filter((entry) => /^module__iteminfo__data\.2026-05-/.test(entry)),
    [
      'module__iteminfo__data.2026-05-14T00-00-00.000Z.json',
      'module__iteminfo__data.2026-05-15T00-00-00.000Z.json',
      'module__iteminfo__data.2026-05-16T00-00-00.000Z.json',
      'module__iteminfo__data.2026-05-17T00-00-00.000Z.json',
      'module__iteminfo__data.2026-05-18T00-00-00.000Z.json',
      'module__iteminfo__data.2026-05-19T00-00-00.000Z.json',
      'module__iteminfo__data.2026-05-20T00-00-00.000Z.json'
    ]
  );
});
