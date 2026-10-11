import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertBuffFenceReadback,
  assertBuffManifestPin,
  assertBuffLockedRederivation,
  buildBuffRecoveryJournalRecord,
} from './buff-canonical-governance-contract.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const packet = {
  runId: 'buff-run-01', fenceToken: 'fence-01', serverUuid: 'server-01', actor: 'buff-runner',
  packetHash: HASH, executionManifestHash: HASH,
};

test('Buff fence contract requires exact server, active owner, and matching fence readback', () => {
  assert.doesNotThrow(() => assertBuffFenceReadback({
    packet,
    server: { serverUuid: 'server-01', port: 13306 },
    owner: { username: 'buff-runner', status: 'ACTIVE' },
    fence: { latest_run_id: 'buff-run-01', fence_token: 'fence-01', active: 1 },
  }));
  assert.throws(() => assertBuffFenceReadback({
    packet,
    server: { serverUuid: 'server-01', port: 13306 },
    owner: { username: 'other', status: 'ACTIVE' },
    fence: { latest_run_id: 'buff-run-01', fence_token: 'fence-01', active: 1 },
  }), /owner|actor/i);
});

test('Buff manifest pin requires packet and envelope to carry the same execution manifest hash', () => {
  assert.doesNotThrow(() => assertBuffManifestPin({ packet, envelope: { executionManifestHash: HASH } }));
  assert.throws(() => assertBuffManifestPin({ packet, envelope: { executionManifestHash: `sha256:${'b'.repeat(64)}` } }), /manifest/i);
});

test('Buff locked rederivation fails closed when the derived candidate hash differs', () => {
  assert.doesNotThrow(() => assertBuffLockedRederivation({ expectedSha256: HASH, actualSha256: HASH }));
  assert.throws(() => assertBuffLockedRederivation({ expectedSha256: HASH, actualSha256: `sha256:${'b'.repeat(64)}` }), /rederivation|drift/i);
});

test('Buff recovery journal record binds phase, packet, envelope, and immutable record hash', () => {
  const record = buildBuffRecoveryJournalRecord({ phase: 'commit-unknown', packet, envelopeSha256: HASH, state: 'RECOVERY_REQUIRED' });
  assert.equal(record.schemaVersion, 'buff-recovery-journal/v1');
  assert.equal(record.packetHash, HASH);
  assert.match(record.recordSha256, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => buildBuffRecoveryJournalRecord({ phase: 'unknown', packet, envelopeSha256: HASH, state: 'RECOVERY_REQUIRED' }), /phase/i);
});
