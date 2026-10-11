import { createHash } from 'node:crypto';

export const ARMOR_CANONICAL_RECOVERY_JOURNAL_SCHEMA = 'armor-canonical-recovery-journal/v1';
export const ARMOR_CANONICAL_RECOVERY_STATES = Object.freeze([
  'PREPARED',
  'COMMITTED',
  'COMMIT_UNKNOWN',
  'ROLLBACK_CONFIRMED',
  'COMPENSATION_REQUIRED',
  'RECONCILIATION_REQUIRED',
  'RECONCILED',
]);
export const ARMOR_CANONICAL_MATERIALIZATION_STATES = Object.freeze(['PENDING', 'VERIFIED']);

const HASH = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const OPERATION_ID = 'canonical-armor-ingestion';
const ID_TABLES = new Set([
  'local.source_dataset_landings',
  'maint.maint_armor_sets',
  'maint.maint_armor_set_images',
  'relation.relation_armor_sets',
  'relation.relation_armor_set_items',
  'relation.relation_armor_set_images',
  'relation.projection_armor_sets',
]);
const TRANSITIONS = Object.freeze({
  PREPARED: new Set(['COMMITTED', 'COMMIT_UNKNOWN', 'ROLLBACK_CONFIRMED', 'COMPENSATION_REQUIRED', 'RECONCILIATION_REQUIRED']),
  COMMIT_UNKNOWN: new Set(['RECONCILIATION_REQUIRED', 'RECONCILED']),
  COMMITTED: new Set(['COMPENSATION_REQUIRED', 'RECONCILED']),
  ROLLBACK_CONFIRMED: new Set(['RECONCILED']),
  COMPENSATION_REQUIRED: new Set(['RECONCILED']),
  RECONCILIATION_REQUIRED: new Set(['RECONCILED']),
  RECONCILED: new Set(),
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function hash(value) {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
}

function hashValue(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function utcSecond(value, label) {
  text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid second-precision UTC timestamp`);
  }
  if (new Date(value).toISOString().slice(0, 19) + 'Z' !== value) throw new Error(`${label} has an invalid UTC calendar date`);
  return value;
}

function normalizeIdMap(value, label, { allowEmpty = false } = {}) {
  plainObject(value, label);
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0 && !allowEmpty) throw new Error(`${label} must not be empty`);
  const normalized = {};
  const allocatedByTable = new Map();
  for (const [identity, id] of entries) {
    const separator = identity.indexOf('|');
    const table = identity.slice(0, separator);
    const key = identity.slice(separator + 1);
    if (separator < 0 || !ID_TABLES.has(table) || !key.trim() || key !== key.trim()) {
      throw new Error(`${label} contains an invalid logical identity`);
    }
    if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${label} contains an invalid allocated ID`);
    const allocated = allocatedByTable.get(table) ?? new Set();
    if (allocated.has(id)) throw new Error(`${label} contains duplicate allocated IDs in ${table}`);
    allocated.add(id);
    allocatedByTable.set(table, allocated);
    normalized[identity] = id;
  }
  return normalized;
}

function requireIntent(intent) {
  plainObject(intent, 'Armor intent');
  if (intent.operationId !== OPERATION_ID) throw new Error('Armor recovery journal operation is invalid');
  hashValue(intent.intentSha256, 'Armor intent hash');
  utcSecond(intent.writeTimestamp, 'Armor intent writeTimestamp');
  return intent;
}

function requireMaterialized(materialized) {
  plainObject(materialized, 'Armor materialized intent');
  hashValue(materialized.intentSha256, 'materialized intent hash');
  hashValue(materialized.concreteAfterSha256, 'materialized concrete after hash');
  return {
    intentSha256: materialized.intentSha256,
    concreteAfterSha256: materialized.concreteAfterSha256,
    verifiedIdMap: normalizeIdMap(materialized.verifiedIdMap, 'materialized verified ID map', { allowEmpty: true }),
  };
}

function requirePendingMaterialization(journal, { requirePrepared = true } = {}) {
  if (journal.materializationStatus !== 'PENDING' || (requirePrepared && journal.state !== 'PREPARED')
      || journal.concreteAfterSha256 !== null || Object.keys(journal.verifiedIdMap ?? {}).length !== 0) {
    throw new Error('Armor recovery journal is not awaiting materialization');
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function buildHashedJournal(journal) {
  const withoutHash = { ...journal };
  delete withoutHash.journalSha256;
  const result = { ...withoutHash, journalSha256: hash(withoutHash) };
  // Both construction and advancement must uphold the same contract as disk
  // readback. Never return evidence that the terminal verifier would reject.
  validateArmorCanonicalRecoveryJournal(result);
  return deepFreeze(result);
}

function validateEvidence(value) {
  plainObject(value, 'Armor recovery journal evidence');
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (entry !== null && typeof entry !== 'string' && typeof entry !== 'boolean'
        && !(Number.isSafeInteger(entry) && entry >= 0)) {
      throw new Error(`Armor recovery journal evidence.${key} must be scalar`);
    }
  }
  return value;
}

export function buildArmorCanonicalRecoveryJournal({
  intent,
  materialized,
  packetHash,
  runId,
  decisionIdentity,
  serverUuid,
  preparedAt,
} = {}) {
  const frozenIntent = requireIntent(intent);
  const frozenMaterialized = requireMaterialized(materialized);
  hashValue(packetHash, 'Armor recovery packet hash');
  text(runId, 'Armor recovery runId');
  text(decisionIdentity, 'Armor recovery decision identity');
  if (!UUID.test(serverUuid ?? '')) throw new Error('Armor recovery server UUID is invalid');
  utcSecond(preparedAt, 'Armor recovery preparedAt');
  if (frozenMaterialized.intentSha256 !== frozenIntent.intentSha256) throw new Error('Armor recovery intent binding drifted');
  const journal = {
    schemaVersion: ARMOR_CANONICAL_RECOVERY_JOURNAL_SCHEMA,
    operationId: OPERATION_ID,
    state: 'PREPARED',
    materializationStatus: 'VERIFIED',
    runId,
    decisionIdentity,
    packetHash,
    serverUuid,
    intentSha256: frozenIntent.intentSha256,
    writeTimestamp: frozenIntent.writeTimestamp,
    concreteAfterSha256: frozenMaterialized.concreteAfterSha256,
    verifiedIdMap: frozenMaterialized.verifiedIdMap,
    evidence: { preparedAt },
    history: [{ state: 'PREPARED', occurredAt: preparedAt }],
  };
  return buildHashedJournal(journal);
}

export function buildArmorCanonicalPreparedRecoveryJournal({
  intent,
  packetHash,
  runId,
  decisionIdentity,
  serverUuid,
  preparedAt,
} = {}) {
  const frozenIntent = requireIntent(intent);
  hashValue(packetHash, 'Armor recovery packet hash');
  text(runId, 'Armor recovery runId');
  text(decisionIdentity, 'Armor recovery decision identity');
  if (!UUID.test(serverUuid ?? '')) throw new Error('Armor recovery server UUID is invalid');
  utcSecond(preparedAt, 'Armor recovery preparedAt');
  const journal = {
    schemaVersion: ARMOR_CANONICAL_RECOVERY_JOURNAL_SCHEMA,
    operationId: OPERATION_ID,
    state: 'PREPARED',
    materializationStatus: 'PENDING',
    runId,
    decisionIdentity,
    packetHash,
    serverUuid,
    intentSha256: frozenIntent.intentSha256,
    writeTimestamp: frozenIntent.writeTimestamp,
    concreteAfterSha256: null,
    verifiedIdMap: {},
    evidence: { preparedAt },
    history: [{ state: 'PREPARED', occurredAt: preparedAt }],
  };
  return buildHashedJournal(journal);
}

export function materializeArmorCanonicalRecoveryJournal({ journal, materialized } = {}) {
  validateArmorCanonicalRecoveryJournal(journal);
  requirePendingMaterialization(journal, { requirePrepared: true });
  const frozenMaterialized = requireMaterialized(materialized);
  if (frozenMaterialized.intentSha256 !== journal.intentSha256) throw new Error('Armor recovery materialized intent hash drifted');
  return buildHashedJournal({
    ...journal,
    materializationStatus: 'VERIFIED',
    concreteAfterSha256: frozenMaterialized.concreteAfterSha256,
    verifiedIdMap: frozenMaterialized.verifiedIdMap,
  });
}

export function validateArmorCanonicalRecoveryJournal(journal) {
  plainObject(journal, 'Armor recovery journal');
  if (journal.schemaVersion !== ARMOR_CANONICAL_RECOVERY_JOURNAL_SCHEMA || journal.operationId !== OPERATION_ID) {
    throw new Error('Armor recovery journal identity is invalid');
  }
  if (!ARMOR_CANONICAL_RECOVERY_STATES.includes(journal.state)) throw new Error('Armor recovery journal state is invalid');
  if (!ARMOR_CANONICAL_MATERIALIZATION_STATES.includes(journal.materializationStatus)) throw new Error('Armor recovery materialization state is invalid');
  text(journal.runId, 'Armor recovery runId');
  text(journal.decisionIdentity, 'Armor recovery decision identity');
  hashValue(journal.packetHash, 'Armor recovery packet hash');
  if (!UUID.test(journal.serverUuid ?? '')) throw new Error('Armor recovery server UUID is invalid');
  hashValue(journal.intentSha256, 'Armor recovery intent hash');
  utcSecond(journal.writeTimestamp, 'Armor recovery writeTimestamp');
  if (journal.materializationStatus === 'PENDING') {
    requirePendingMaterialization(journal, { requirePrepared: false });
  } else {
    hashValue(journal.concreteAfterSha256, 'Armor recovery concrete after hash');
    normalizeIdMap(journal.verifiedIdMap, 'Armor recovery verified ID map', { allowEmpty: true });
  }
  validateEvidence(journal.evidence);
  if (!Array.isArray(journal.history) || journal.history.length === 0) throw new Error('Armor recovery journal history is required');
  if (journal.history[0]?.state !== 'PREPARED') throw new Error('Armor recovery journal history must start at PREPARED');
  if (journal.history.at(-1)?.state !== journal.state) throw new Error('Armor recovery journal history must end at the current state');
  for (let index = 0; index < journal.history.length; index += 1) {
    const event = journal.history[index];
    plainObject(event, 'Armor recovery journal history event');
    if (!ARMOR_CANONICAL_RECOVERY_STATES.includes(event.state)) throw new Error('Armor recovery journal history state is invalid');
    utcSecond(event.occurredAt, 'Armor recovery journal history timestamp');
    if (index > 0) {
      const previous = journal.history[index - 1];
      if (!TRANSITIONS[previous.state]?.has(event.state)) throw new Error('Armor recovery journal history transition is invalid');
      if (Date.parse(event.occurredAt) < Date.parse(previous.occurredAt)) throw new Error('Armor recovery journal history is not chronological');
    }
  }
  if (journal.evidence.preparedAt !== journal.history[0].occurredAt
      || Date.parse(journal.evidence.preparedAt) < Date.parse(journal.writeTimestamp)) {
    throw new Error('Armor recovery preparation timestamp binding is invalid');
  }
  validateTerminalEvidence(journal);
  hashValue(journal.journalSha256, 'Armor recovery journal hash');
  const { journalSha256: _ignored, ...withoutHash } = journal;
  if (hash(withoutHash) !== journal.journalSha256) throw new Error('Armor recovery journal hash drifted');
  return true;
}

export function assertArmorCanonicalRecoveryCommitBinding({
  journal,
  intent,
  materialized,
  packetHash,
  runId,
  decisionIdentity,
  serverUuid,
} = {}) {
  validateArmorCanonicalRecoveryJournal(journal);
  if (journal.state !== 'PREPARED') throw new Error('Armor recovery commit requires a PREPARED journal');
  if (journal.materializationStatus !== 'VERIFIED') throw new Error('Armor recovery commit requires verified materialization');
  const frozenIntent = requireIntent(intent);
  const frozenMaterialized = requireMaterialized(materialized);
  hashValue(packetHash, 'Armor recovery packet hash');
  text(runId, 'Armor recovery runId');
  text(decisionIdentity, 'Armor recovery decision identity');
  if (!UUID.test(serverUuid ?? '')) throw new Error('Armor recovery server UUID is invalid');
  const sameMap = stable(journal.verifiedIdMap) === stable(frozenMaterialized.verifiedIdMap);
  if (journal.operationId !== frozenIntent.operationId || journal.intentSha256 !== frozenIntent.intentSha256
      || journal.writeTimestamp !== frozenIntent.writeTimestamp
      || frozenMaterialized.intentSha256 !== frozenIntent.intentSha256
      || journal.concreteAfterSha256 !== frozenMaterialized.concreteAfterSha256
      || journal.packetHash !== packetHash || journal.runId !== runId
      || journal.decisionIdentity !== decisionIdentity || journal.serverUuid !== serverUuid || !sameMap) {
    throw new Error('Armor recovery commit binding drifted from prepared journal');
  }
  return true;
}

export function advanceArmorCanonicalRecoveryJournal({ journal, nextState, occurredAt, evidence = {} } = {}) {
  validateArmorCanonicalRecoveryJournal(journal);
  if (!ARMOR_CANONICAL_RECOVERY_STATES.includes(nextState)) throw new Error('Armor recovery next state is invalid');
  if (!TRANSITIONS[journal.state]?.has(nextState)) {
    throw new Error(`Armor recovery transition ${journal.state} -> ${nextState} is invalid`);
  }
  utcSecond(occurredAt, 'Armor recovery transition timestamp');
  validateEvidence(evidence);
  if (Object.hasOwn(evidence, 'preparedAt') && evidence.preparedAt !== journal.evidence.preparedAt) {
    throw new Error('Armor recovery preparation evidence is immutable');
  }
  const next = {
    ...journal,
    state: nextState,
    evidence: { ...journal.evidence, ...evidence },
    history: [...journal.history, { state: nextState, occurredAt }],
  };
  return buildHashedJournal(next);
}

function validateTerminalEvidence(journal) {
  const { state, evidence } = journal;
  const rollbackWithoutMaterialization = state === 'ROLLBACK_CONFIRMED'
    || (state === 'RECONCILED' && evidence.observedState === 'ROLLED_BACK');
  if (state !== 'PREPARED' && journal.materializationStatus !== 'VERIFIED' && !rollbackWithoutMaterialization) {
    throw new Error('Armor terminal recovery evidence requires verified materialization');
  }
  if (state === 'COMMITTED' && evidence.observedAfterSha256 !== journal.concreteAfterSha256) {
    throw new Error('Armor committed recovery evidence must match the concrete after hash');
  }
  if (state === 'RECONCILED' && !['COMMITTED', 'ROLLED_BACK'].includes(evidence.observedState)) {
    throw new Error('Armor reconciled recovery evidence must name a committed or rolled back state');
  }
  if (state === 'RECONCILED' && evidence.observedState === 'COMMITTED'
      && evidence.observedAfterSha256 !== journal.concreteAfterSha256) {
    throw new Error('Armor reconciled committed evidence must match the concrete after hash');
  }
  if (state === 'RECONCILED') {
    const previousState = journal.history.at(-2)?.state;
    if (previousState === 'COMMITTED' && evidence.observedState !== 'COMMITTED'
        || previousState === 'ROLLBACK_CONFIRMED' && evidence.observedState !== 'ROLLED_BACK') {
      throw new Error('Armor reconciliation contradicts the known outcome; compensation must be explicit');
    }
  }
}
