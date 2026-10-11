import { createHash } from 'node:crypto';
import path from 'node:path';

export const ARMOR_TYPED_EFFECT_RECOVERY_OWNER_SCHEMA =
  'armor-typed-effect-recovery-owner/v1';
export const ARMOR_TYPED_EFFECT_RECOVERY_OPERATION_ID =
  'canonical-armor-typed-effect-publication';
export const ARMOR_TYPED_EFFECT_RECOVERY_STATUSES = Object.freeze([
  'ROLLBACK_CONFIRMED',
  'COMMITTED_READBACK_REQUIRED',
  'EXPECTED_STATE_PRESENT',
  'RECONCILIATION_REQUIRED',
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const FINGERPRINT_KEYS = Object.freeze([
  'pageRevisionId',
  'iteminfoRevisionId',
  'armorSetsRevisionId',
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)), 'utf8')
    .digest('hex')}`;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function hash(value, label) {
  if (!HASH.test(String(value ?? ''))) throw new Error(`${label} must be a SHA-256 hash`);
  return String(value);
}

function fingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...FINGERPRINT_KEYS].sort())) {
    throw new Error('typed-effect recovery owner source fingerprint is invalid');
  }
  return Object.fromEntries(FINGERPRINT_KEYS.map(key => {
    const revision = Number(value[key]);
    if (!Number.isSafeInteger(revision) || revision <= 0 || typeof value[key] !== 'number') {
      throw new Error(`typed-effect recovery owner source revision is invalid: ${key}`);
    }
    return [key, revision];
  }));
}

function relativePath(value, label) {
  const result = text(value, label);
  if (path.posix.normalize(result) !== result || result.startsWith('/') || result.includes('\\')
      || result.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return result;
}

function timestamp(value, label) {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} must be a valid timestamp`);
  return result;
}

function normalize(input = {}) {
  const outputKeys = [
    'schemaVersion', 'operationId', 'ownerIdentity', 'ownerRole', 'decisionIdentity',
    'proposalSha256', 'sourceFingerprint', 'reconciliationPath', 'allowedStatuses',
    'databaseWrites', 'permitReplayAllowed', 'reviewedAt', 'rationale',
  ];
  const inputKeys = [
    'ownerIdentity', 'ownerRole', 'decisionIdentity', 'proposalSha256', 'sourceFingerprint',
    'reconciliationPath', 'allowedStatuses', 'reviewedAt', 'rationale',
  ];
  const full = Object.hasOwn(input, 'schemaVersion');
  const allowedKeys = full ? [...outputKeys, 'bindingSha256'] : inputKeys;
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(allowedKeys.sort())) {
    throw new Error('typed-effect recovery owner evidence contains unsupported fields');
  }
  if (full && (input.schemaVersion !== ARMOR_TYPED_EFFECT_RECOVERY_OWNER_SCHEMA
      || input.operationId !== ARMOR_TYPED_EFFECT_RECOVERY_OPERATION_ID
      || input.databaseWrites !== false
      || input.permitReplayAllowed !== false)) {
    throw new Error('typed-effect recovery owner evidence identity or safety flags are invalid');
  }
  const statuses = input.allowedStatuses;
  if (!Array.isArray(statuses) || statuses.length !== ARMOR_TYPED_EFFECT_RECOVERY_STATUSES.length
      || JSON.stringify([...new Set(statuses)].sort())
        !== JSON.stringify([...ARMOR_TYPED_EFFECT_RECOVERY_STATUSES].sort())) {
    throw new Error('typed-effect recovery owner allowed statuses are invalid');
  }
  return {
    schemaVersion: ARMOR_TYPED_EFFECT_RECOVERY_OWNER_SCHEMA,
    operationId: ARMOR_TYPED_EFFECT_RECOVERY_OPERATION_ID,
    ownerIdentity: text(input.ownerIdentity, 'typed-effect recovery owner identity'),
    ownerRole: text(input.ownerRole, 'typed-effect recovery owner role'),
    decisionIdentity: text(input.decisionIdentity, 'typed-effect recovery owner decision identity'),
    proposalSha256: hash(input.proposalSha256, 'typed-effect recovery owner proposal hash'),
    sourceFingerprint: fingerprint(input.sourceFingerprint),
    reconciliationPath: relativePath(input.reconciliationPath, 'typed-effect reconciliation path'),
    allowedStatuses: [...ARMOR_TYPED_EFFECT_RECOVERY_STATUSES],
    databaseWrites: false,
    permitReplayAllowed: false,
    reviewedAt: timestamp(input.reviewedAt, 'typed-effect recovery owner reviewedAt'),
    rationale: text(input.rationale, 'typed-effect recovery owner rationale'),
  };
}

export function buildArmorTypedEffectRecoveryOwnerEvidence(input = {}) {
  const payload = normalize(input);
  return Object.freeze({ ...payload, bindingSha256: hashJson(payload) });
}

export function validateArmorTypedEffectRecoveryOwnerEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('typed-effect recovery owner evidence is required');
  }
  hash(evidence.bindingSha256, 'typed-effect recovery owner evidence hash');
  const { bindingSha256, ...payload } = evidence;
  const normalized = normalize(evidence);
  if (JSON.stringify(stable(normalized)) !== JSON.stringify(stable(payload))) {
    throw new Error('typed-effect recovery owner evidence fields drifted');
  }
  if (hashJson(payload) !== bindingSha256) {
    throw new Error('typed-effect recovery owner evidence hash drifted');
  }
  return true;
}

export function assertArmorTypedEffectRecoveryOwnerBinding(
  evidence,
  { proposalSha256, sourceFingerprint, reconciliationPath, decisionIdentity } = {},
) {
  validateArmorTypedEffectRecoveryOwnerEvidence(evidence);
  if (evidence.proposalSha256 !== hash(proposalSha256, 'typed-effect proposal hash')) {
    throw new Error('typed-effect recovery owner proposal binding drifted');
  }
  if (JSON.stringify(stable(evidence.sourceFingerprint))
      !== JSON.stringify(stable(fingerprint(sourceFingerprint)))) {
    throw new Error('typed-effect recovery owner source fingerprint drifted');
  }
  if (evidence.reconciliationPath !== relativePath(reconciliationPath, 'typed-effect reconciliation path')) {
    throw new Error('typed-effect recovery owner reconciliation path drifted');
  }
  if (evidence.decisionIdentity !== text(decisionIdentity, 'typed-effect owner decision identity')) {
    throw new Error('typed-effect recovery owner decision identity drifted');
  }
  return true;
}
