import { createHash } from 'node:crypto';

export const ARMOR_MISSING_ATTRIBUTE_OWNER_DECISION_SCHEMA =
  'armor-missing-attribute-owner-decision/v1';
export const ARMOR_MISSING_ATTRIBUTE_OPERATION_ID =
  'canonical-armor-missing-attribute-source';
export const ARMOR_MISSING_ATTRIBUTE_GATE_IDS = Object.freeze([
  'source-evidence',
  'maint-item-identity',
  'item-scoped-facts',
  'set-owned-facts',
  'recovery-owner',
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function timestamp(value, label) {
  const valueText = text(value, label);
  if (!TIMESTAMP.test(valueText) || !Number.isFinite(Date.parse(valueText))) {
    throw new Error(`${label} is invalid`);
  }
  return new Date(valueText).toISOString();
}

function requireHash(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} is invalid`);
  return value;
}

function validateGateDecisions(gateDecisions) {
  if (!gateDecisions || typeof gateDecisions !== 'object' || Array.isArray(gateDecisions)) {
    throw new Error('Armor missing-attribute owner decision gate decisions are required');
  }
  if (JSON.stringify(Object.keys(gateDecisions).sort())
      !== JSON.stringify([...ARMOR_MISSING_ATTRIBUTE_GATE_IDS].sort())) {
    throw new Error('Armor missing-attribute owner decision must account for every gate exactly once');
  }
  for (const gateId of ARMOR_MISSING_ATTRIBUTE_GATE_IDS) {
    const gate = gateDecisions[gateId];
    if (!gate || !['resolved', 'blocked', 'not-reviewed'].includes(gate.status)) {
      throw new Error(`Armor missing-attribute owner decision gate is invalid: ${gateId}`);
    }
    text(gate.note, `${gateId} note`);
    if (gate.status === 'resolved') {
      requireHash(gate.evidenceSha256, `${gateId} evidence hash`);
      const evidencePath = text(gate.evidencePath, `${gateId} evidence path`);
      if (evidencePath.startsWith('/') || evidencePath.includes('\\')
          || evidencePath.split('/').some(part => part === '' || part === '.' || part === '..')) {
        throw new Error(`${gateId} evidence path is invalid`);
      }
    } else if (gate.evidencePath != null || gate.evidenceSha256 != null) {
      throw new Error(`${gateId} unresolved gate cannot carry evidence`);
    }
  }
}

export function buildArmorMissingAttributeOwnerDecision(input = {}) {
  const allowed = [
    'actor', 'authorizationReference', 'decisionIdentity', 'evidenceSha256',
    'gateDecisions', 'proposalSha256', 'rationale', 'reviewedAt',
  ];
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify([...allowed].sort())) {
    throw new Error('Armor missing-attribute owner decision contains unsupported fields');
  }
  const proposalSha256 = requireHash(input.proposalSha256, 'Armor missing-attribute proposal hash');
  const evidenceSha256 = requireHash(input.evidenceSha256, 'Armor missing-attribute evidence hash');
  validateGateDecisions(input.gateDecisions);
  const reviewedAt = timestamp(input.reviewedAt, 'Armor missing-attribute reviewedAt');
  const reviewComplete = ARMOR_MISSING_ATTRIBUTE_GATE_IDS
    .every(gateId => input.gateDecisions[gateId].status === 'resolved');
  const body = {
    schemaVersion: ARMOR_MISSING_ATTRIBUTE_OWNER_DECISION_SCHEMA,
    operationId: ARMOR_MISSING_ATTRIBUTE_OPERATION_ID,
    proposalSha256,
    evidenceSha256,
    actor: text(input.actor, 'Armor missing-attribute decision actor'),
    authorizationReference: text(input.authorizationReference, 'Armor missing-attribute authorization reference'),
    decisionIdentity: text(input.decisionIdentity, 'Armor missing-attribute decision identity'),
    reviewedAt,
    rationale: text(input.rationale, 'Armor missing-attribute decision rationale'),
    reviewStatus: 'recorded',
    gateDecisions: structuredClone(input.gateDecisions),
    reviewComplete,
    executionReady: reviewComplete,
    formalAdmission: false,
    databaseWrites: false,
    applyAllowed: false,
  };
  return { ...body, decisionSha256: hashJson(body) };
}

export function validateArmorMissingAttributeOwnerDecision(decision) {
  const { decisionSha256, ...body } = decision ?? {};
  if (!HASH.test(decisionSha256 ?? '') || hashJson(body) !== decisionSha256) {
    throw new Error('Armor missing-attribute owner decision hash drifted');
  }
  if (buildArmorMissingAttributeOwnerDecision({
    proposalSha256: body.proposalSha256,
    evidenceSha256: body.evidenceSha256,
    actor: body.actor,
    authorizationReference: body.authorizationReference,
    decisionIdentity: body.decisionIdentity,
    reviewedAt: body.reviewedAt,
    rationale: body.rationale,
    gateDecisions: body.gateDecisions,
  }).decisionSha256 !== decisionSha256) {
    throw new Error('Armor missing-attribute owner decision fields drifted');
  }
  return true;
}

export function assertArmorMissingAttributeOwnerDecisionBinding(decision, {
  proposalSha256, evidenceSha256,
} = {}) {
  validateArmorMissingAttributeOwnerDecision(decision);
  if (decision.operationId !== ARMOR_MISSING_ATTRIBUTE_OPERATION_ID
      || decision.proposalSha256 !== proposalSha256
      || decision.evidenceSha256 !== evidenceSha256
      || decision.formalAdmission !== false
      || decision.databaseWrites !== false
      || decision.applyAllowed !== false) {
    throw new Error('Armor missing-attribute owner decision binding or safety flags drifted');
  }
  const blockers = ARMOR_MISSING_ATTRIBUTE_GATE_IDS
    .filter(gateId => decision.gateDecisions[gateId].status !== 'resolved')
    .map(gateId => `${gateId}: ${decision.gateDecisions[gateId].status}`);
  return {
    executionReady: decision.executionReady === true && blockers.length === 0,
    blockers,
    formalAdmission: false,
    applyAllowed: false,
  };
}
