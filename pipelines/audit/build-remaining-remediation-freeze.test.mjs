import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRemainingRemediationFreeze } from './build-remaining-remediation-freeze.mjs';

async function fixture(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remaining-freeze-'));
  const reports = {
    crossDb: { summary: { blockingCount: 0 } },
    itemSourceCandidates: { summary: { plannedSourceRows: 4, blockedCandidates: 2 } },
    itemSourceDryRun: { apply: false, summary: { duplicates: 1, toInsert: 3 } },
    localCoreCompat: { items: { status: 'fail' }, npcs: { status: 'fail' }, bosses: { status: 'fail' } },
    imageLineage: { summary: { notReadyEntityTypes: 0 } },
    ...overrides,
  };
  const paths = {};
  for (const [key, value] of Object.entries(reports)) { paths[key] = path.join(root, `${key}.json`); await fs.writeFile(paths[key], JSON.stringify(value)); }
  return { root, paths, reports };
}

test('builds a loopback read-only freeze with a scoped hash', async () => {
  const { root, paths, reports } = await fixture();
  const freeze = await buildRemainingRemediationFreeze({ runRoot: root, reportPaths: paths, localCoreCompat: reports.localCoreCompat, outputPath: path.join(root, 'freeze.json') });
  assert.equal(freeze.readOnly, true);
  assert.equal(freeze.databaseWrites, false);
  assert.match(freeze.scopeHash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(freeze.itemSource, { plannedRows: 4, duplicates: 1, toInsert: 3, blockedCandidates: 2 });
});

test('rejects unsafe or incomplete baseline inputs', async () => {
  const unsafe = await fixture({ itemSourceDryRun: { apply: true, summary: {} } });
  await assert.rejects(() => buildRemainingRemediationFreeze({ runRoot: unsafe.root, reportPaths: unsafe.paths, localCoreCompat: unsafe.reports.localCoreCompat }), /apply=false/);
  const missing = await fixture({ localCoreCompat: { items: {}, npcs: {} } });
  await assert.rejects(() => buildRemainingRemediationFreeze({ runRoot: missing.root, reportPaths: missing.paths, localCoreCompat: missing.reports.localCoreCompat }), /missing parity domain/);
  const remote = await fixture();
  await assert.rejects(() => buildRemainingRemediationFreeze({ runRoot: remote.root, reportPaths: remote.paths, localCoreCompat: remote.reports.localCoreCompat, databaseHost: 'db.internal' }), /loopback/);
});
