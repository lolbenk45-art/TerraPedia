import {
  advanceBuffRecoveryJournal,
  buildBuffRecoveryJournalRecord,
} from './buff-canonical-recovery-journal.mjs';

export function createBuffRecoveryJournalAdapter({ store, packet, envelopeSha256, operationId = 'canonical-buff-full-chain', clock = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.create !== 'function' || typeof store.advance !== 'function') {
    throw new Error('Buff recovery journal store is required');
  }
  const state = { current: null };
  const advance = async ({ phase, state: nextState, evidence = {} }) => {
    if (!state.current) throw new Error('Buff recovery journal is not prepared');
    const next = advanceBuffRecoveryJournal({
      journal: state.current,
      phase,
      state: nextState,
      evidence,
      occurredAt: clock(),
    });
    await store.advance({ previousRecordSha256: state.current.recordSha256, journal: next });
    state.current = next;
    return next;
  };
  return Object.freeze({
    async prepared({ packet: observedPacket = packet } = {}) {
      if (state.current) throw new Error('Buff recovery journal PREPARED callback was duplicated');
      if (observedPacket?.runId !== packet?.runId || observedPacket?.packetHash !== packet?.packetHash) {
        throw new Error('Buff recovery journal packet binding drifted');
      }
      const prepared = buildBuffRecoveryJournalRecord({
        phase: 'prepared', packet, envelopeSha256, state: 'PREPARED', operationId,
      });
      await store.create(prepared);
      state.current = prepared;
      return prepared;
    },
    async rolledBack({ error } = {}) {
      return advance({ phase: 'rolled-back', state: 'ROLLED_BACK', evidence: { error: String(error?.message ?? error ?? 'unknown') } });
    },
    async commitUnknown({ error } = {}) {
      return advance({ phase: 'commit-unknown', state: 'RECOVERY_REQUIRED', evidence: { error: String(error?.message ?? error ?? 'unknown') } });
    },
    async committed() {
      return advance({ phase: 'committed', state: 'COMMITTED' });
    },
  });
}
