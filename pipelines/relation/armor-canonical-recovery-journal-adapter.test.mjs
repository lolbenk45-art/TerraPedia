import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createArmorCanonicalRecoveryJournalStore } from './armor-canonical-recovery-journal-store.mjs';

const HASH = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;

function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-adapter-')); }

function expected() {
  return {
    landingMaintIntent: { operationId: 'canonical-armor-ingestion', intentSha256: HASH('a'), writeTimestamp: '2026-09-25T00:00:00Z' },
    relationIntent: { operationId: 'canonical-armor-ingestion', intentSha256: HASH('b'), writeTimestamp: '2026-09-25T00:00:00Z' },
    recoveryIntent: { operationId: 'canonical-armor-ingestion', intentSha256: HASH('composite'), writeTimestamp: '2026-09-25T00:00:00Z' },
  };
}

function updateOnlyExpected() {
  return {
    ...expected(),
    landingMaintIntent: { ...expected().landingMaintIntent, insertPlans: [] },
    relationIntent: { ...expected().relationIntent, insertPlans: [] },
  };
}

const packet = {
  runId: 'run-1', decisionIdentity: 'decision-1', packetHash: HASH('c'),
  serverUuid: '11111111-1111-1111-1111-111111111111',
};

function materialize() {
  return {
    intentSha256: HASH('composite'),
    concreteAfterSha256: HASH('d'),
    verifiedIdMap: {
      'local.source_dataset_landings|landing': 101,
      'relation.relation_armor_sets|relation': 201,
    },
  };
}

test('recovery adapter persists PREPARED then COMMITTED with exact materialization', async () => {
  const repoRoot = tempRoot();
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json' });
  const { createArmorCanonicalRecoveryJournalAdapter } = await import('./armor-canonical-recovery-journal-adapter.mjs');
  let materializeCalls = 0;
  const adapter = createArmorCanonicalRecoveryJournalAdapter({
    store, packet, expected: expected(), materialize: async () => { materializeCalls += 1; return materialize(); },
    clock: () => '2026-09-25T00:00:01Z',
  });
  await adapter.prepared({ packet, expected: expected() });
  const prepared = await store.read();
  assert.equal(prepared.state, 'PREPARED');
  assert.equal(prepared.materializationStatus, 'PENDING');
  assert.equal(prepared.concreteAfterSha256, null);
  assert.deepEqual(prepared.verifiedIdMap, {});
  assert.equal(materializeCalls, 0);
  await adapter.materialized({ receipts: [] });
  assert.equal((await store.read()).materializationStatus, 'VERIFIED');
  assert.equal(materializeCalls, 1);
  await adapter.committed({});
  const journal = await store.read();
  assert.equal(journal.state, 'COMMITTED');
  assert.equal(journal.history.length, 2);
  assert.equal(journal.concreteAfterSha256, HASH('d'));
});

test('recovery adapter commits update-only materialization with no allocated IDs', async () => {
  const repoRoot = tempRoot();
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json' });
  const { createArmorCanonicalRecoveryJournalAdapter } = await import('./armor-canonical-recovery-journal-adapter.mjs');
  const adapter = createArmorCanonicalRecoveryJournalAdapter({
    store,
    packet,
    expected: updateOnlyExpected(),
    materialize: async () => ({ intentSha256: HASH('composite'), concreteAfterSha256: HASH('d'), verifiedIdMap: {} }),
    clock: () => '2026-09-25T00:00:01Z',
  });
  await adapter.prepared({ packet, expected: updateOnlyExpected() });
  await adapter.materialized({ receipts: [], verifiedIdMap: {} });
  await adapter.committed({});
  const journal = await store.read();
  assert.equal(journal.state, 'COMMITTED');
  assert.deepEqual(journal.verifiedIdMap, {});
});

test('recovery adapter persists PREPARED before materialization failure and allows confirmed rollback', async () => {
  const repoRoot = tempRoot();
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json' });
  const { createArmorCanonicalRecoveryJournalAdapter } = await import('./armor-canonical-recovery-journal-adapter.mjs');
  const adapter = createArmorCanonicalRecoveryJournalAdapter({
    store, packet, expected: expected(), materialize: async () => { throw new Error('receipt failure'); },
    clock: () => '2026-09-25T00:00:01Z',
  });
  await adapter.prepared({ packet, expected: expected() });
  await assert.rejects(() => adapter.materialized({ receipts: [] }), /receipt failure/);
  await adapter.rolledBack({});
  const journal = await store.read();
  assert.equal(journal.state, 'ROLLBACK_CONFIRMED');
  assert.equal(journal.materializationStatus, 'PENDING');
});

test('recovery adapter records rollback-confirmed and commit-unknown transitions', async () => {
  const repoRoot = tempRoot();
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json' });
  const { createArmorCanonicalRecoveryJournalAdapter } = await import('./armor-canonical-recovery-journal-adapter.mjs');
  const adapter = createArmorCanonicalRecoveryJournalAdapter({
    store, packet, expected: expected(), materialize: async () => materialize(),
    clock: (() => { let i = 0; return () => `2026-09-25T00:00:0${++i}Z`; })(),
  });
  await adapter.prepared({ packet, expected: expected() });
  await adapter.materialized({ receipts: [] });
  await adapter.commitUnknown({});
  assert.equal((await store.read()).state, 'COMMIT_UNKNOWN');

  const repoRoot2 = tempRoot();
  const store2 = createArmorCanonicalRecoveryJournalStore({ repoRoot: repoRoot2, relativePath: 'reports/journal.json' });
  const adapter2 = createArmorCanonicalRecoveryJournalAdapter({
    store: store2, packet, expected: expected(), materialize: async () => materialize(),
    clock: () => '2026-09-25T00:00:01Z',
  });
  await adapter2.prepared({ packet, expected: expected() });
  await adapter2.materialized({ receipts: [] });
  await adapter2.rolledBack({});
  assert.equal((await store2.read()).state, 'ROLLBACK_CONFIRMED');
});
