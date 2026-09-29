import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildBuffRecoveryJournalRecord } from './buff-canonical-recovery-journal.mjs';
import { createBuffRecoveryJournalStore } from './buff-canonical-recovery-journal-store.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

test('Buff recovery journal store creates and atomically advances a private file', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-journal-'));
  const relativePath = 'reports/journal.json';
  const store = createBuffRecoveryJournalStore({ repoRoot, relativePath });
  const prepared = buildBuffRecoveryJournalRecord({
    phase: 'prepared', packet: { runId: 'run-1', fenceToken: 'fence-1', packetHash: HASH },
    envelopeSha256: HASH, state: 'PREPARED',
  });
  await store.create(prepared);
  assert.deepEqual(await store.read(), prepared);
  assert.equal((fs.statSync(path.join(repoRoot, relativePath)).mode & 0o077), 0);
  await assert.rejects(store.create(prepared), /already exists/i);
});
