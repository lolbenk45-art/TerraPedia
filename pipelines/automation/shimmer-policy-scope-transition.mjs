import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';
import { SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';

export const SHIMMER_SCOPE_TRANSITION_OPERATION_ID = 'automation-shimmer-l2-scope-transition';
export const SHIMMER_SCOPE_CAPABILITIES = Object.freeze(['items', 'shimmer', 'town_npc_maintenance']);
export const SHIMMER_POLICY_SCOPES = Object.freeze(SHIMMER_PARTITION_SCOPES.map((scope) => Object.freeze({
  databaseRole: scope.databaseRole,
  table: scope.table,
  fieldGroup: scope.fieldGroup,
  logicalPredicateHash: scope.logicalPredicateHash,
})));

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function assertShimmerAutomaticPolicy({ policy, policyRows, activationPolicySetHash } = {}) {
  assertShimmerSixScopePolicy(policy);
  const rows = policyRows.map((row) => ({
    domainId: row.domainId, policyVersion: Number(row.policyVersion), policyHash: row.policyHash,
  }));
  const current = rows.find((row) => row.domainId === 'shimmer');
  if (current?.policyHash !== policy.policyHash || current?.policyVersion !== Number(policy.policyVersion)) {
    throw new Error('Shimmer automatic policy does not match the current policy set row');
  }
  if (computePolicySetHash(rows) !== activationPolicySetHash) {
    throw new Error('Shimmer automatic activation policy set is stale');
  }
  return true;
}

export function assertShimmerSixScopePolicy(policy) {
  let policyJson;
  try {
    policyJson = typeof policy?.policyJson === 'string' ? JSON.parse(policy.policyJson) : policy?.policyJson;
  } catch {
    throw new Error('Shimmer automatic policy JSON is invalid');
  }
  if (policy?.domainId !== 'shimmer' || (policy.currentLevel ?? policy.level) !== 'L2'
      || policy.operationalState !== 'ACTIVE' || !Number.isSafeInteger(Number(policy.policyVersion))
      || Number(policy.policyVersion) < 3 || policyJson?.level !== 'L2'
      || computePolicyHash(policyJson) !== policy.policyHash) {
    throw new Error('Shimmer automatic policy requires the registered six-scope L2 version and exact hash');
  }
  if (!Array.isArray(policyJson.ownedTables)
      || computePolicyHash(policyJson.ownedTables) !== computePolicyHash(SHIMMER_POLICY_SCOPES)) {
    throw new Error('Shimmer automatic policy scopes must exactly match all six partition identities and order');
  }
  return true;
}

// This builder produces review evidence only. Runtime authority comes from the
// registered operation's independently verified packet and scoped decisions.
export function buildShimmerPolicyScopeTransition({
  currentPolicy,
  currentPolicyRows,
  nextPolicyVersion,
  serverFingerprint,
  generatedAt,
} = {}) {
  if (currentPolicy?.domainId !== 'shimmer' || currentPolicy.level !== 'L2'
      || currentPolicy.operationalState !== 'ACTIVE' || currentPolicy.policyVersion !== 2) {
    throw new Error('Shimmer scope transition requires exact v2/L2/ACTIVE predecessor');
  }
  if (nextPolicyVersion !== 3) throw new Error('Shimmer scope transition requires next immutable version 3');
  requireHash(serverFingerprint, 'server fingerprint');
  requireTime(generatedAt, 'generatedAt');
  const policyJson = currentPolicy.policyJson;
  if (!policyJson || policyJson.schemaVersion !== 1 || policyJson.level !== 'L2'
      || policyJson.requireSnapshot !== true || policyJson.anomalyAction !== 'CIRCUIT_OPEN') {
    throw new Error('Shimmer predecessor ceiling safety contract is invalid');
  }
  requireHash(currentPolicy.policyHash, 'current policy hash');
  if (computePolicyHash(policyJson) !== currentPolicy.policyHash) {
    throw new Error('Shimmer predecessor policy JSON does not match its hash');
  }
  assertLegacyScopes(policyJson.ownedTables);
  const rows = canonicalizePolicySet(currentPolicyRows);
  const row = rows.find((entry) => entry.domainId === 'shimmer');
  if (row?.policyVersion !== currentPolicy.policyVersion || row?.policyHash !== currentPolicy.policyHash) {
    throw new Error('Shimmer predecessor does not match current policy set');
  }
  const targetJson = { ...structuredClone(policyJson), ownedTables: structuredClone(SHIMMER_POLICY_SCOPES) };
  const policyHash = computePolicyHash(targetJson);
  const targetRows = rows.map((entry) => entry.domainId === 'shimmer'
    ? { domainId: 'shimmer', policyVersion: nextPolicyVersion, policyHash }
    : entry);
  const candidate = {
    schemaVersion: 1,
    operationId: SHIMMER_SCOPE_TRANSITION_OPERATION_ID,
    proposalOnly: true,
    executable: false,
    generatedAt,
    serverFingerprint,
    currentPolicy: {
      domainId: 'shimmer', policyVersion: 2, level: 'L2', operationalState: 'ACTIVE',
      policyHash: currentPolicy.policyHash, policyJson: structuredClone(policyJson),
    },
    currentPolicyRows: rows,
    currentPolicySetHash: computePolicySetHash(rows),
    targetPolicy: { domainId: 'shimmer', policyVersion: nextPolicyVersion, level: 'L2', policyHash, policyJson: targetJson },
    targetPolicySetHash: computePolicySetHash(targetRows),
  };
  return freeze({ ...candidate, transitionHash: computePolicyHash(candidate) });
}

export function assertShimmerPolicyScopeTransition(candidate) {
  const rebuilt = buildShimmerPolicyScopeTransition({
    currentPolicy: candidate?.currentPolicy,
    currentPolicyRows: candidate?.currentPolicyRows,
    nextPolicyVersion: candidate?.targetPolicy?.policyVersion,
    serverFingerprint: candidate?.serverFingerprint,
    generatedAt: candidate?.generatedAt,
  });
  if (computePolicyHash(candidate) !== computePolicyHash(rebuilt)) {
    throw new Error('Shimmer scope transition identity, target scopes or ceilings drifted');
  }
  return true;
}

export function assertShimmerScopeTransitionApprovals({ candidate, approvals, ownerUsername, now } = {}) {
  assertShimmerPolicyScopeTransition(candidate);
  requireText(ownerUsername, 'active Owner');
  const nowMs = requireTime(now, 'approval verification time');
  if (!Array.isArray(approvals) || approvals.length !== SHIMMER_SCOPE_CAPABILITIES.length) {
    throw new Error('Three exact Shimmer owner capability approvals are required');
  }
  const capabilities = new Set();
  const decisions = new Set();
  for (const approval of approvals) {
    if (!SHIMMER_SCOPE_CAPABILITIES.includes(approval?.capability)
        || capabilities.has(approval.capability) || approval.actor !== ownerUsername
        || approval.transitionHash !== candidate.transitionHash) {
      throw new Error('Shimmer capability approval is not bound to this Owner and transition');
    }
    const decision = requireText(approval.decisionIdentity, 'capability approval decision');
    requireText(approval.authorizationReference, 'capability approval reference');
    if (decisions.has(decision)) throw new Error('Shimmer capability approval decisions must be distinct');
    const start = requireTime(approval.authorizedAt, 'capability authorization time');
    const end = requireTime(approval.expiresAt, 'capability expiry');
    if (start > nowMs || nowMs >= end) throw new Error('Shimmer capability approval is expired or not yet valid');
    capabilities.add(approval.capability);
    decisions.add(decision);
  }
  return true;
}

function assertLegacyScopes(scopes) {
  const expected = SHIMMER_PARTITION_SCOPES.filter((scope) => scope.capability === 'shimmer')
    .map(({ databaseRole, table }) => ({ databaseRole, table, fieldGroup: 'all_columns' }))
    .sort((left, right) => left.table.localeCompare(right.table));
  if (!Array.isArray(scopes) || scopes.length !== expected.length) {
    throw new Error('Shimmer predecessor must contain exactly the four historical transform scopes');
  }
  const sorted = [...scopes].sort((left, right) => String(left?.table).localeCompare(String(right?.table)));
  if (computePolicyHash(sorted) !== computePolicyHash(expected)) {
    throw new Error('Shimmer predecessor scopes are not the exact four-table policy');
  }
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function requireTime(value, label) {
  requireText(value, label);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} must be an ISO timestamp`);
  return time;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
