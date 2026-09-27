const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const L2_POLICY_STABLE_REAUTHORIZATION_DOMAINS = Object.freeze([
  'items',
  'npcs',
  'projectiles',
  'armor_sets',
  'buffs',
  'audio',
  'bosses',
  'shimmer',
]);

export function l2PolicyStableReauthorizationOperationId(domainId) {
  const domain = requireDomain(domainId);
  return `automation-${domain.replaceAll('_', '-')}-l2-reauthorization`;
}

export function isL2PolicyStableReauthorizationOperation(operationId) {
  return L2_POLICY_STABLE_REAUTHORIZATION_DOMAINS
    .some((domainId) => l2PolicyStableReauthorizationOperationId(domainId) === operationId);
}

export function buildL2PolicyStableReauthorizationInput(value, options = {}) {
  return assertL2PolicyStableReauthorizationInput(value, options);
}

export function assertL2PolicyStableReauthorizationInput(value, { now = new Date().toISOString() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('L2 reauthorization input is required');
  }
  if (value.schemaVersion !== 1) throw new Error('L2 reauthorization schemaVersion must be 1');
  const domainId = requireDomain(value.domainId);
  const operationId = requireText(value.operationId, 'operationId');
  if (operationId !== l2PolicyStableReauthorizationOperationId(domainId)) {
    throw new Error('L2 reauthorization operationId does not match the domain');
  }
  if (value.databaseName !== 'terria_v1_local') {
    throw new Error('L2 reauthorization databaseName must be terria_v1_local');
  }
  if (value.reauthorization !== true) throw new Error('L2 reauthorization marker is required');
  if (Object.hasOwn(value, 'targetLevel') || Object.hasOwn(value, 'targetOperationalState')) {
    throw new Error('L2 reauthorization must not declare a policy transition');
  }

  const currentPolicy = normalizeCurrentL2Policy(value.currentPolicy, domainId, 'current policy');
  const targetPolicy = normalizeCurrentL2Policy(value.targetPolicy, domainId, 'target policy');
  if (stableJson(targetPolicy) !== stableJson(currentPolicy)) {
    throw new Error('target policy must exactly equal current L2 policy');
  }

  const predecessorL1Evidence = normalizePredecessorL1Evidence(value.predecessorL1Evidence, currentPolicy);
  const priorDecision = normalizePriorDecision(value.priorDecision, domainId, now);

  return Object.freeze({
    schemaVersion: 1,
    operationId,
    databaseName: 'terria_v1_local',
    domainId,
    reauthorization: true,
    currentPolicy,
    predecessorL1Evidence,
    priorDecision,
    targetPolicy,
  });
}

function normalizeCurrentL2Policy(value, domainId, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is required`);
  }
  if (value.domainId !== domainId) throw new Error(`${label} domain does not match`);
  const policyVersion = Number(value.policyVersion);
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 2) {
    throw new Error(`${label} version must identify a promoted L2 policy`);
  }
  if (value.level !== 'L2' || value.operationalState !== 'ACTIVE') {
    throw new Error(`${label} must be L2/ACTIVE`);
  }
  return Object.freeze({
    domainId,
    policyVersion,
    policyHash: requireHash(value.policyHash, `${label} hash`),
    level: 'L2',
    operationalState: 'ACTIVE',
    policySetHash: requireHash(value.policySetHash, `${label} policy-set hash`),
  });
}

function normalizePredecessorL1Evidence(value, currentPolicy) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('predecessor L1 evidence is required');
  }
  const policyVersion = Number(value.policyVersion);
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1 || policyVersion >= currentPolicy.policyVersion) {
    throw new Error('predecessor L1 evidence must precede current L2 policy');
  }
  if (Number(value.minimumSuccessfulL1Runs) < 3) {
    throw new Error('at least three predecessor L1 runs are required');
  }
  if (value.fullReconciliation !== true) {
    throw new Error('full reconciliation evidence is required');
  }
  return Object.freeze({
    policyVersion,
    policyHash: requireHash(value.policyHash, 'predecessor L1 policy hash'),
    policySetHash: requireHash(value.policySetHash, 'predecessor L1 policy-set hash'),
    minimumSuccessfulL1Runs: 3,
    fullReconciliation: true,
  });
}

function normalizePriorDecision(value, domainId, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('prior L2 promotion decision is required');
  }
  if (value.decisionKind !== 'L2_PROMOTION') {
    throw new Error('prior decision must be an L2 promotion decision');
  }
  const expiresAt = requireTimestamp(value.expiresAt, 'prior L2 promotion decision expiry');
  if (Date.parse(expiresAt) > Date.parse(requireTimestamp(now, 'reauthorization time'))) {
    throw new Error('prior L2 promotion decision must be expired');
  }
  return Object.freeze({
    decisionKind: 'L2_PROMOTION',
    decisionIdentity: requireText(value.decisionIdentity, 'prior L2 promotion decision identity'),
    packetHash: requireHash(value.packetHash, 'prior L2 promotion packet hash'),
    policySetHash: requireHash(value.policySetHash ?? value.priorPolicySetHash, 'prior L2 promotion policy-set hash'),
    expiresAt,
    domainId,
  });
}

function requireDomain(value) {
  const domainId = requireText(value, 'domainId');
  if (!L2_POLICY_STABLE_REAUTHORIZATION_DOMAINS.includes(domainId)) {
    throw new Error('unsupported L2 policy-stable reauthorization domain');
  }
  return domainId;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function stableJson(value) {
  return JSON.stringify(value);
}
