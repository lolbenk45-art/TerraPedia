import { createHash } from 'node:crypto';

const HASH = /^sha256:[0-9a-f]{64}$/;
const PHASES = new Set(['prepared', 'commit-unknown', 'committed', 'rolled-back']);
const STATES = new Set(['PREPARED', 'RECOVERY_REQUIRED', 'COMMITTED', 'ROLLED_BACK']);

export function assertBuffFenceReadback({ packet, server, owner, fence } = {}) {
  if (!packet || typeof packet !== 'object') throw new Error('Buff fence packet is required');
  if (server?.serverUuid !== packet.serverUuid) throw new Error('Buff fence server identity drifted');
  if (owner?.username !== packet.actor || owner?.status !== 'ACTIVE') throw new Error('Buff fence owner is not active or actor drifted');
  if (Number(fence?.active) !== 1 || fence?.latest_run_id !== packet.runId || fence?.fence_token !== packet.fenceToken) {
    throw new Error('Buff ownership fence is missing, foreign or expired');
  }
  return true;
}

export function assertBuffManifestPin({ packet, envelope } = {}) {
  requireHash(packet?.executionManifestHash, 'packet executionManifestHash');
  if (!envelope || envelope.executionManifestHash !== packet.executionManifestHash) {
    throw new Error('Buff execution manifest is not pinned to the packet');
  }
  return true;
}

export function assertBuffLockedRederivation({ expectedSha256, actualSha256 } = {}) {
  requireHash(expectedSha256, 'expected locked rederivation hash');
  requireHash(actualSha256, 'actual locked rederivation hash');
  if (expectedSha256 !== actualSha256) throw new Error('Buff locked rederivation drifted');
  return true;
}

export function buildBuffRecoveryJournalRecord({ phase, packet, envelopeSha256, state } = {}) {
  if (!PHASES.has(phase)) throw new Error('Buff recovery journal phase is invalid');
  if (!STATES.has(state)) throw new Error('Buff recovery journal state is invalid');
  requireHash(envelopeSha256, 'Buff recovery journal envelopeSha256');
  const packetHash = packet?.packetHash;
  requireHash(packetHash, 'Buff recovery journal packetHash');
  const body = {
    schemaVersion: 'buff-recovery-journal/v1',
    operationId: 'canonical-buff-full-chain',
    phase,
    state,
    runId: requireText(packet?.runId, 'Buff recovery journal runId'),
    fenceToken: requireText(packet?.fenceToken, 'Buff recovery journal fenceToken'),
    packetHash,
    envelopeSha256,
  };
  return Object.freeze({ ...body, recordSha256: hash(body) });
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
