import { createHash } from 'node:crypto';
import path from 'node:path';

export const ARMOR_TYPED_EFFECT_OWNER_DECISION_SCHEMA =
  'armor-typed-effect-owner-decision/v1';
export const ARMOR_TYPED_EFFECT_OPERATION_ID =
  'canonical-armor-typed-effect-publication';

export const ARMOR_TYPED_EFFECT_REQUIRED_GATES = Object.freeze([
  'complete-armor-coverage',
  'shroomite-canonical-owner',
  'mining-identity-and-attributes',
  'typed-set-effect-owner',
  'recovery-owner',
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION_KEYS = Object.freeze([
  'pageRevisionId',
  'iteminfoRevisionId',
  'armorSetsRevisionId',
]);
const GATE_STATUSES = new Set(['resolved', 'blocked', 'not-reviewed']);
const DECISION_KEYS = Object.freeze([
  'schemaVersion', 'operationId', 'reviewStatus', 'formalAdmission', 'databaseWrites',
  'applyAllowed', 'proposalSha256', 'sourceFingerprint', 'actor',
  'authorizationReference', 'decisionIdentity', 'reviewedAt', 'rationale',
  'gateDecisions', 'reviewComplete', 'executionReady',
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

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function requireHash(value, label) {
  if (!HASH.test(String(value ?? ''))) throw new Error(`${label} must be a SHA-256 hash`);
  return String(value);
}

function normalizeSourceFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('typed-effect owner decision source fingerprint is required');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...REVISION_KEYS].sort())) {
    throw new Error('typed-effect owner decision source fingerprint keys are invalid');
  }
  return Object.fromEntries(REVISION_KEYS.map((key) => {
    const number = Number(value[key]);
    if (typeof value[key] !== 'number' || !Number.isSafeInteger(number) || number <= 0) {
      throw new Error(`typed-effect owner decision source revision is invalid: ${key}`);
    }
    return [key, number];
  }));
}

function normalizeEvidence(value, gateId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`typed-effect owner decision gate is invalid: ${gateId}`);
  }
  const status = requireText(value.status, `${gateId} status`);
  if (!GATE_STATUSES.has(status)) throw new Error(`${gateId} status is invalid`);
  const note = requireText(value.note, `${gateId} note`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([
    'evidencePath', 'evidenceSha256', 'note', 'status',
  ])) {
    throw new Error(`${gateId} contains unsupported evidence fields`);
  }
  const evidencePath = value.evidencePath == null ? null : requireText(value.evidencePath, `${gateId} evidence path`);
  const evidenceSha256 = value.evidenceSha256 == null ? null : requireHash(value.evidenceSha256, `${gateId} evidence hash`);
  if (status === 'resolved' && (!evidencePath || !evidenceSha256)) {
    throw new Error(`${gateId} resolved gate requires bound evidence`);
  }
  if (evidencePath && (evidencePath.startsWith('/') || evidencePath.includes('\\')
      || path.posix.normalize(evidencePath) !== evidencePath
      || evidencePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..'))) {
    throw new Error(`${gateId} evidence path must be repository-relative`);
  }
  return { status, evidencePath, evidenceSha256, note };
}

function normalizeGateDecisions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('typed-effect owner decision gate decisions are required');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...ARMOR_TYPED_EFFECT_REQUIRED_GATES].sort())) {
    throw new Error('typed-effect owner decision must account for every required gate exactly once');
  }
  return Object.fromEntries(ARMOR_TYPED_EFFECT_REQUIRED_GATES.map((gateId) => [
    gateId,
    normalizeEvidence(value[gateId], gateId),
  ]));
}

function normalizeDecision(input = {}) {
  const inputKeys = Object.keys(input).sort();
  const allowedInputKeys = DECISION_KEYS.filter(key => ![
    'schemaVersion', 'operationId', 'reviewStatus', 'formalAdmission',
    'databaseWrites', 'applyAllowed', 'reviewComplete', 'executionReady',
  ].includes(key)).sort();
  const fullDecision = Object.hasOwn(input, 'schemaVersion');
  const expectedKeys = fullDecision
    ? [...DECISION_KEYS].sort()
    : [...allowedInputKeys];
  if (JSON.stringify(inputKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error('typed-effect owner decision contains unsupported fields');
  }
  if (fullDecision && (input.schemaVersion !== ARMOR_TYPED_EFFECT_OWNER_DECISION_SCHEMA
      || input.operationId !== ARMOR_TYPED_EFFECT_OPERATION_ID
      || input.reviewStatus !== 'recorded'
      || input.formalAdmission !== false
      || input.databaseWrites !== false
      || input.applyAllowed !== false)) {
    throw new Error('typed-effect owner decision identity or safety flags are invalid');
  }
  const gateDecisions = normalizeGateDecisions(input.gateDecisions);
  const reviewComplete = ARMOR_TYPED_EFFECT_REQUIRED_GATES
    .every(gateId => gateDecisions[gateId].status === 'resolved');
  // Projection/API evidence is produced after relation publication. It is
  // therefore post-commit acceptance evidence, not a pre-apply owner gate.
  const executionReady = reviewComplete;
  return {
    schemaVersion: ARMOR_TYPED_EFFECT_OWNER_DECISION_SCHEMA,
    operationId: ARMOR_TYPED_EFFECT_OPERATION_ID,
    reviewStatus: 'recorded',
    formalAdmission: false,
    databaseWrites: false,
    applyAllowed: false,
    proposalSha256: requireHash(input.proposalSha256, 'typed-effect owner decision proposal hash'),
    sourceFingerprint: normalizeSourceFingerprint(input.sourceFingerprint),
    actor: requireText(input.actor, 'typed-effect owner decision actor'),
    authorizationReference: requireText(
      input.authorizationReference,
      'typed-effect owner decision authorization reference',
    ),
    decisionIdentity: requireText(input.decisionIdentity, 'typed-effect owner decision identity'),
    reviewedAt: (() => {
      const reviewedAt = requireText(input.reviewedAt, 'typed-effect owner decision reviewedAt');
      if (!Number.isFinite(Date.parse(reviewedAt))) {
        throw new Error('typed-effect owner decision reviewedAt must be a valid timestamp');
      }
      return reviewedAt;
    })(),
    rationale: requireText(input.rationale, 'typed-effect owner decision rationale'),
    gateDecisions,
    reviewComplete,
    executionReady,
  };
}

export function buildArmorTypedEffectOwnerDecision(input = {}) {
  const payload = normalizeDecision(input);
  return Object.freeze({ ...payload, decisionSha256: hashJson(payload) });
}

export function validateArmorTypedEffectOwnerDecision(decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error('typed-effect owner decision is required');
  }
  if (!HASH.test(String(decision.decisionSha256 ?? ''))) {
    throw new Error('typed-effect owner decision hash is invalid');
  }
  const { decisionSha256, ...payload } = decision;
  const normalized = normalizeDecision(payload);
  if (JSON.stringify(stable(normalized)) !== JSON.stringify(stable(payload))) {
    throw new Error('typed-effect owner decision fields drifted');
  }
  if (hashJson(payload) !== decisionSha256) {
    throw new Error('typed-effect owner decision hash drifted');
  }
  return true;
}

export function evaluateArmorTypedEffectReadiness(decision) {
  validateArmorTypedEffectOwnerDecision(decision);
  const blockers = ARMOR_TYPED_EFFECT_REQUIRED_GATES
    .filter(gateId => decision.gateDecisions[gateId].status !== 'resolved')
    .map(gateId => `${gateId}: ${decision.gateDecisions[gateId].status}`);
  return {
    executionReady: decision.executionReady === true && blockers.length === 0,
    blockers,
    formalAdmission: false,
    applyAllowed: false,
  };
}

export function assertArmorTypedEffectOwnerDecisionBinding(
  decision,
  { proposalSha256, sourceFingerprint } = {},
) {
  validateArmorTypedEffectOwnerDecision(decision);
  if (decision.proposalSha256 !== requireHash(proposalSha256, 'typed-effect proposal hash')) {
    throw new Error('typed-effect owner decision proposal binding drifted');
  }
  const expectedFingerprint = normalizeSourceFingerprint(sourceFingerprint);
  if (JSON.stringify(stable(decision.sourceFingerprint)) !== JSON.stringify(stable(expectedFingerprint))) {
    throw new Error('typed-effect owner decision source fingerprint drifted');
  }
  return evaluateArmorTypedEffectReadiness(decision);
}
