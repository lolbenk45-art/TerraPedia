import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const { createArmorCanonicalRecoveryJournalStore } = await import('./armor-canonical-recovery-journal-store.mjs');

const HASH = value => `sha256:${value.repeat(64)}`;
const prepared = (overrides = {}) => ({
  schemaVersion: 'armor-canonical-recovery-journal/v1',
  operationId: 'canonical-armor-ingestion', state: 'PREPARED', runId: 'run-1',
  decisionIdentity: 'decision-1', packetHash: HASH('a'), serverUuid: '11111111-1111-1111-1111-111111111111',
  intentSha256: HASH('b'), writeTimestamp: '2026-09-25T00:00:00Z', concreteAfterSha256: HASH('c'),
  verifiedIdMap: { 'local.source_dataset_landings|landing': 101 },
  evidence: { preparedAt: '2026-09-25T00:00:00Z' },
  history: [{ state: 'PREPARED', occurredAt: '2026-09-25T00:00:00Z' }],
  journalSha256: HASH('d'),
  ...overrides,
});

function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-journal-')); }

test('recovery journal store writes a private ordinary file and reads the exact journal', async () => {
  const repoRoot = tempRoot();
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json', validateJournal: false });
  const value = prepared();
  await store.create(value);
  assert.deepEqual(await store.read(), value);
  const stat = fs.statSync(path.join(repoRoot, 'reports/journal.json'));
  assert.equal(stat.mode & 0o077, 0);
});

test('recovery journal store refuses symlink targets and duplicate creation', async () => {
  const repoRoot = tempRoot();
  fs.mkdirSync(path.join(repoRoot, 'reports'), { recursive: true });
  fs.symlinkSync('/tmp', path.join(repoRoot, 'reports', 'journal.json'));
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json', validateJournal: false });
  await assert.rejects(() => store.create(prepared()), /ordinary|symlink|confinement/i);
  fs.unlinkSync(path.join(repoRoot, 'reports', 'journal.json'));
  await store.create(prepared());
  await assert.rejects(() => store.create(prepared()), /exists|duplicate/i);
});

test('recovery journal store only advances from the exact persisted hash and retains history', async () => {
  const repoRoot = tempRoot();
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot, relativePath: 'reports/journal.json', validateJournal: false });
  const value = prepared();
  await store.create(value);
  const committed = prepared({
    state: 'COMMITTED',
    evidence: { ...value.evidence, observedState: 'COMMITTED', observedAfterSha256: value.concreteAfterSha256 },
    history: [...value.history, { state: 'COMMITTED', occurredAt: '2026-09-25T00:00:01Z' }],
  });
  await store.advance({ previousJournalSha256: value.journalSha256, journal: committed });
  const read = await store.read();
  assert.equal(read.state, 'COMMITTED');
  assert.equal(read.history.length, 2);
  await assert.rejects(() => store.advance({ previousJournalSha256: HASH('e'), journal: committed }), /previous|hash|drift/i);
});
