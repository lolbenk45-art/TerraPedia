import { createHash } from 'node:crypto';

const HASH = /^sha256:[0-9a-f]{64}$/;
const PHASES = new Set(['prepared', 'commit-unknown', 'committed', 'rolled-back']);
const STATES = new Set(['PREPARED', 'RECOVERY_REQUIRED', 'COMMITTED', 'ROLLED_BACK']);
const TRANSITIONS = new Map([
  ['prepared', new Set(['commit-unknown', 'rolled-back'])],
  ['commit-unknown', new Set(['committed', 'rolled-back'])],
  ['committed', new Set()],
  ['rolled-back', new Set()],
]);

export function buildBuffRecoveryJournalRecord({ phase, packet, envelopeSha256, state } = {}) {
  requirePhase(phase);
  requireState(state);
  requireHash(envelopeSha256, 'Buff recovery journal envelopeSha256');
  const body = {
    schemaVersion: 'buff-recovery-journal/v1',
    operationId: 'canonical-buff-full-chain',
    phase,
    state,
    runId: requireText(packet?.runId, 'Buff recovery journal runId'),
    fenceToken: requireText(packet?.fenceToken, 'Buff recovery journal fenceToken'),
    packetHash: requireHash(packet?.packetHash, 'Buff recovery journal packetHash'),
    envelopeSha256,
    history: [],
  };
  return freeze({ ...body, recordSha256: hash(body) });
}

export function advanceBuffRecoveryJournal({ journal, phase, state, evidence = {}, occurredAt = new Date().toISOString() } = {}) {
  validateBuffRecoveryJournal(journal);
  requirePhase(phase);
  requireState(state);
  if (!(TRANSITIONS.get(journal.phase) ?? new Set()).has(phase)) {
    throw new Error(`Buff recovery journal transition is invalid: ${journal.phase} -> ${phase}`);
  }
  requireText(occurredAt, 'Buff recovery journal occurredAt');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('Buff recovery journal evidence must be an object');
  }
  const historyEntry = {
    fromPhase: journal.phase,
    fromState: journal.state,
    toPhase: phase,
    toState: state,
    occurredAt,
    evidence: clone(evidence),
    previousRecordSha256: journal.recordSha256,
  };
  const body = {
    ...journal,
    phase,
    state,
    history: [...journal.history, historyEntry],
  };
  delete body.recordSha256;
  return freeze({ ...body, recordSha256: hash(body) });
}

export function validateBuffRecoveryJournal(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    throw new Error('Buff recovery journal is required');
  }
  if (journal.schemaVersion !== 'buff-recovery-journal/v1'
      || journal.operationId !== 'canonical-buff-full-chain') {
    throw new Error('Buff recovery journal identity is invalid');
  }
  requirePhase(journal.phase);
  requireState(journal.state);
  requireText(journal.runId, 'Buff recovery journal runId');
  requireText(journal.fenceToken, 'Buff recovery journal fenceToken');
  requireHash(journal.packetHash, 'Buff recovery journal packetHash');
  requireHash(journal.envelopeSha256, 'Buff recovery journal envelopeSha256');
  if (!Array.isArray(journal.history)) throw new Error('Buff recovery journal history is required');
  let previous = null;
  for (const event of journal.history) {
    if (!event || event.previousRecordSha256 !== previous) {
      throw new Error('Buff recovery journal history is not hash chained');
    }
    if (!PHASES.has(event.fromPhase) || !STATES.has(event.fromState)
        || !PHASES.has(event.toPhase) || !STATES.has(event.toState)
        || !(TRANSITIONS.get(event.fromPhase) ?? new Set()).has(event.toPhase)
        || typeof event.occurredAt !== 'string' || !event.occurredAt.trim()) {
      throw new Error('Buff recovery journal history transition is invalid');
    }
    previous = hashWithoutRecord({ ...journal, phase: event.fromPhase, state: event.fromState, history: journal.history.slice(0, journal.history.indexOf(event)) });
  }
  requireHash(journal.recordSha256, 'Buff recovery journal recordSha256');
  const expected = hashWithoutRecord(journal);
  if (expected !== journal.recordSha256) throw new Error('Buff recovery journal record hash drifted');
  return true;
}

function hashWithoutRecord(value) {
  const copy = { ...value };
  delete copy.recordSha256;
  return hash(copy);
}

function requirePhase(value) {
  if (!PHASES.has(value)) throw new Error('Buff recovery journal phase is invalid');
}

function requireState(value) {
  if (!STATES.has(value)) throw new Error('Buff recovery journal state is invalid');
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function requireHash(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function freeze(value) {
  Object.freeze(value.history);
  return Object.freeze(value);
}
