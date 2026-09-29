import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceBuffRecoveryJournal,
  buildBuffRecoveryJournalRecord,
  validateBuffRecoveryJournal,
} from './buff-canonical-recovery-journal.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const packet = {
  runId: 'buff-run-01',
  fenceToken: 'fence-01',
  packetHash: HASH,
};

test('Buff recovery journal advances immutably from prepared to commit-unknown', () => {
  const prepared = buildBuffRecoveryJournalRecord({
    phase: 'prepared',
    packet,
    envelopeSha256: HASH,
    state: 'PREPARED',
  });
  assert.doesNotThrow(() => validateBuffRecoveryJournal(prepared));
  const unknown = advanceBuffRecoveryJournal({
    journal: prepared,
    phase: 'commit-unknown',
    state: 'RECOVERY_REQUIRED',
    evidence: { reason: 'lost commit acknowledgement' },
  });
  assert.equal(unknown.phase, 'commit-unknown');
  assert.equal(unknown.state, 'RECOVERY_REQUIRED');
  assert.equal(unknown.history.length, 1);
  assert.equal(unknown.history[0].previousRecordSha256, prepared.recordSha256);
  assert.notEqual(unknown.recordSha256, prepared.recordSha256);
});

test('Buff recovery journal rejects illegal transitions and tampered history', () => {
  const prepared = buildBuffRecoveryJournalRecord({
    phase: 'prepared', packet, envelopeSha256: HASH, state: 'PREPARED',
  });
  assert.throws(() => advanceBuffRecoveryJournal({
    journal: prepared, phase: 'committed', state: 'COMMITTED',
  }), /transition/i);
  const tampered = { ...prepared, recordSha256: HASH };
  assert.throws(() => validateBuffRecoveryJournal(tampered), /record|hash/i);
});
