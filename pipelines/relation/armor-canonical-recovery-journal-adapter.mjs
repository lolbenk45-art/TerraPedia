import {
  advanceArmorCanonicalRecoveryJournal,
  buildArmorCanonicalPreparedRecoveryJournal,
  materializeArmorCanonicalRecoveryJournal,
} from './armor-canonical-recovery-journal.mjs';

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`);
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function recoveryIntent(expected) {
  const intent = expected?.recoveryIntent;
  if (intent) return intent;
  const landing = text(expected?.landingMaintIntent?.intentSha256, 'Armor landing/maint intent hash');
  const relation = text(expected?.relationIntent?.intentSha256, 'Armor relation intent hash');
  // Callers that omit a precomputed composite intent must provide it through
  // the operation-specific packet; silently inventing a new hash here would
  // make the packet bind a different graph than the reviewed candidate.
  throw new Error(`Armor recovery composite intent is required for ${landing}/${relation}`);
}

function expectedInsertPlanCount(expected) {
  return (expected?.landingMaintIntent?.insertPlans?.length ?? 0)
    + (expected?.relationIntent?.insertPlans?.length ?? 0);
}

export function createArmorCanonicalRecoveryJournalAdapter({
  store, packet, expected, materialize,
  clock = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
} = {}) {
  plain(store, 'Armor recovery journal store');
  for (const method of ['create', 'read', 'advance']) if (typeof store[method] !== 'function') throw new Error(`Armor recovery journal store ${method} is required`);
  plain(packet, 'Armor recovery packet');
  plain(expected, 'Armor recovery expected intents');
  if (typeof materialize !== 'function') throw new Error('Armor recovery materializer is required');
  const frozenIntent = recoveryIntent(expected);
  const state = { prepared: false, journal: null, materialized: null };
  const eventTime = () => text(clock(), 'Armor recovery event time');
  const advance = async (nextState, evidence = {}) => {
    if (!state.journal) throw new Error('Armor recovery journal has not been persisted');
    const next = advanceArmorCanonicalRecoveryJournal({ journal: state.journal, nextState, occurredAt: eventTime(), evidence });
    await store.advance({ previousJournalSha256: state.journal.journalSha256, journal: next });
    state.journal = next;
    return next;
  };

  return Object.freeze({
    async prepared({ packet: observedPacket = packet, expected: observedExpected = expected } = {}) {
      if (state.prepared) throw new Error('Armor recovery PREPARED callback was duplicated');
      if (observedPacket.runId !== packet.runId || observedPacket.decisionIdentity !== packet.decisionIdentity
          || observedPacket.packetHash !== packet.packetHash || observedPacket.serverUuid !== packet.serverUuid) {
        throw new Error('Armor recovery packet binding drifted before preparation');
      }
      if (observedExpected?.recoveryIntent?.intentSha256 !== frozenIntent.intentSha256
          || observedExpected?.landingMaintIntent?.intentSha256 !== expected.landingMaintIntent.intentSha256
          || observedExpected?.relationIntent?.intentSha256 !== expected.relationIntent.intentSha256) {
        throw new Error('Armor recovery expected intent object drifted before preparation');
      }
      const prepared = buildArmorCanonicalPreparedRecoveryJournal({
        intent: frozenIntent,
        packetHash: packet.packetHash,
        runId: packet.runId,
        decisionIdentity: packet.decisionIdentity,
        serverUuid: packet.serverUuid,
        preparedAt: eventTime(),
      });
      await store.create(prepared);
      state.prepared = true;
      state.journal = prepared;
      return prepared;
    },
    async materialized({ receipts = [], verifiedIdMap = null } = {}) {
      if (!state.prepared) throw new Error('Armor recovery materialization requires PREPARED callback');
      if (!state.journal) throw new Error('Armor recovery materialization has no persisted PREPARED journal');
      if (state.materialized) throw new Error('Armor recovery materialization was duplicated');
      const materialized = await materialize({ expected, receipts, verifiedIdMap });
      plain(materialized, 'Armor recovery materialized intent');
      if (expectedInsertPlanCount(expected) > 0
          && Object.keys(materialized.verifiedIdMap ?? {}).length === 0) {
        throw new Error('Armor recovery materialized insert plans require verified IDs');
      }
      if (materialized.intentSha256 !== frozenIntent.intentSha256) throw new Error('Armor recovery materialized intent hash drifted');
      const materializedJournal = materializeArmorCanonicalRecoveryJournal({ journal: state.journal, materialized });
      await store.advance({ previousJournalSha256: state.journal.journalSha256, journal: materializedJournal });
      state.journal = materializedJournal;
      state.materialized = materialized;
      return materializedJournal;
    },
    async rolledBack() {
      if (!state.journal) return null;
      if (state.journal.state !== 'PREPARED') throw new Error(`Armor recovery rollback state is ${state.journal.state}`);
      return advance('ROLLBACK_CONFIRMED', { observedState: 'ROLLED_BACK' });
    },
    async commitUnknown() {
      if (!state.journal) throw new Error('Armor recovery commit uncertainty has no persisted PREPARED journal');
      if (state.journal.state !== 'PREPARED') throw new Error(`Armor recovery commit uncertainty state is ${state.journal.state}`);
      return advance('COMMIT_UNKNOWN', { observedState: 'UNKNOWN' });
    },
    async committed() {
      if (!state.journal) throw new Error('Armor recovery commit has no persisted PREPARED journal');
      if (state.journal.state !== 'PREPARED') throw new Error(`Armor recovery commit state is ${state.journal.state}`);
      return advance('COMMITTED', {
        observedState: 'COMMITTED', observedAfterSha256: state.journal.concreteAfterSha256,
      });
    },
  });
}
