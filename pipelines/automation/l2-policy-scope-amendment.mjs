import { createHash } from 'node:crypto';

import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { canonicalServerFingerprint, hashCanonicalServerFingerprint } from './automation-database-contract.mjs';

const HASH = /^sha256:[a-f0-9]{64}$/;
const DOMAINS = Object.freeze(['items', 'armor_sets']);
const OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-scope-amendment',
  armor_sets: 'automation-armor-sets-l2-scope-amendment',
  armor_sets_after_items: 'automation-armor-sets-l2-scope-amendment-after-items',
});

const ITEM_OWNED_TABLES = Object.freeze([
  ['local', 'source_dataset_landings'],
  ['local', 'category'],
  ['local', 'item_images'],
  ['local', 'item_acquisition_sources'],
  ['local', 'recipes'],
  ['local', 'recipe_ingredients'],
  ['local', 'recipe_stations'],
  ['local', 'item_biomes'],
  ['local', 'biome_resources'],
  ['maint', 'maint_items'],
  ['maint', 'maint_item_categories'],
  ['maint', 'maint_item_images'],
  ['maint', 'maint_item_recipes'],
  ['maint', 'maint_item_sources'],
  ['maint', 'maint_item_biomes'],
  ['relation', 'relation_items'],
  ['relation', 'relation_item_images'],
  ['relation', 'relation_item_rarities'],
  ['relation', 'category_nodes'],
  ['relation', 'item_category_assignments'],
  ['relation', 'item_recipe_heads'],
  ['relation', 'item_recipe_ingredients'],
  ['relation', 'item_recipe_stations'],
  ['relation', 'item_source_facts'],
  ['relation', 'item_source_details'],
  ['relation', 'item_npc_shop_relations'],
  ['relation', 'item_npc_loot_relations'],
  ['relation', 'item_npc_relation_audits'],
  ['relation', 'item_biome_relations'],
  ['relation', 'projection_items'],
]);

const ARMOR_OWNED_TABLES = Object.freeze([
  ['local', 'source_dataset_landings'],
  ['maint', 'maint_armor_sets'],
  ['maint', 'maint_armor_set_images'],
  ['relation', 'relation_armor_sets'],
  ['relation', 'relation_armor_set_items'],
  ['relation', 'relation_armor_set_images'],
  ['relation', 'projection_armor_sets'],
]);

const CURRENT_BASE_SCOPES = Object.freeze({
  items: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }),
  ]),
  armor_sets: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' }),
    Object.freeze({ databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' }),
  ]),
});

export const L2_POLICY_SCOPE_AMENDMENT_DOMAINS = DOMAINS;

export function buildL2PolicyScopeAmendmentProposal(input = {}) {
  const domainId = requireDomain(input.domainId);
  const operationId = input.operationId ?? OPERATION_IDS[domainId];
  if (![OPERATION_IDS[domainId], OPERATION_IDS.armor_sets_after_items].includes(operationId)) {
    throw new Error('scope amendment operationId does not match the requested domain');
  }
  const currentPolicy = normalizeCurrentPolicy(input.currentPolicy, domainId);
  if (!Array.isArray(input.currentPolicyRows) || input.currentPolicyRows.length === 0) {
    throw new Error('current policy rows are required');
  }
  const currentPolicyRows = normalizePolicyRows(input.currentPolicyRows);
  const currentPolicySetHash = computePolicySetHash(currentPolicyRows);
  if (currentPolicy.policySetHash !== currentPolicySetHash) {
    throw new Error('current policy-set identity drifted from its policy rows');
  }
  const currentDomainRow = currentPolicyRows.find((row) => row.domainId === domainId);
  if (!currentDomainRow || currentDomainRow.policyVersion !== currentPolicy.policyVersion
      || currentDomainRow.policyHash !== currentPolicy.policyHash) {
    throw new Error('current policy identity does not match its policy-set row');
  }
  const expectedBase = CURRENT_BASE_SCOPES[domainId];
  if (stableJson(normalizeOwnedScopeSequence(currentPolicy.policyJson.ownedTables))
      !== stableJson(normalizeOwnedScopeSequence(expectedBase))) {
    throw new Error(`current ${domainId} base policy scope is not the expected L2 scope`);
  }
  const targetPolicyVersion = requirePositiveInteger(input.targetPolicyVersion, 'targetPolicyVersion');
  if (targetPolicyVersion !== currentPolicy.policyVersion + 1) {
    throw new Error('target policy version must be the next version after current L2');
  }
  const addedScopes = addedScopesFor(domainId);
  const targetPolicyJson = {
    ...currentPolicy.policyJson,
    ratioDisableCap: 0,
    absoluteDisableCap: 0,
    ratioRelationshipDeleteCap: 0,
    absoluteRelationshipDeleteCap: 0,
    ownedTables: [...currentPolicy.policyJson.ownedTables, ...addedScopes],
  };
  const targetPolicyHash = computePolicyHash(targetPolicyJson);
  const targetPolicyRows = currentPolicyRows.map((row) => row.domainId === domainId
    ? { domainId, policyVersion: targetPolicyVersion, policyHash: targetPolicyHash }
    : row);
  const targetPolicySetHash = computePolicySetHash(targetPolicyRows);
  const sourceIdentity = normalizeSourceIdentity(input.sourceIdentity);
  const serverFingerprint = canonicalServerFingerprint(input.serverFingerprint);
  if (!['127.0.0.1', 'localhost', '::1'].includes(serverFingerprint.host)
      || serverFingerprint.port !== 13306) {
    throw new Error('policy scope amendment database target must be the fixed loopback MySQL server on port 13306');
  }
  const predecessorL1Evidence = normalizePredecessorL1Evidence(input.predecessorL1Evidence, currentPolicy);
  const authorizationReference = requireText(input.authorizationReference, 'authorizationReference');
  const generatedAt = requireTimestamp(input.generatedAt, 'generatedAt');

  const payload = {
    schemaVersion: 1,
    artifactKind: 'l2-policy-scope-amendment-proposal',
    proposalOnly: true,
    operationId,
    domainId,
    generatedAt,
    authorizationReference,
    currentPolicy,
    currentPolicyRows,
    currentPolicySetHash,
    serverFingerprint,
    serverFingerprintHash: hashCanonicalServerFingerprint(serverFingerprint),
    targetPolicy: {
      policyVersion: targetPolicyVersion,
      level: 'L2',
      policyHash: targetPolicyHash,
      policyJson: targetPolicyJson,
    },
    targetPolicyRows,
    targetPolicySetHash,
    sourceIdentity,
    predecessorL1Evidence,
    allowedMutation: 'append_policy_version_and_advance_current_pointer_only',
  };
  return Object.freeze({ ...payload, amendmentHash: hashCanonical(payload) });
}

export function assertL2PolicyScopeAmendmentProposal(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('L2 policy scope amendment proposal is required');
  }
  if (value.schemaVersion !== 1 || value.artifactKind !== 'l2-policy-scope-amendment-proposal'
      || value.proposalOnly !== true) {
    throw new Error('candidate L2 policy scope amendment proposal is required');
  }
  const { amendmentHash, ...payload } = value;
  if (!HASH.test(amendmentHash ?? '') || hashCanonical(payload) !== amendmentHash) {
    throw new Error('L2 policy scope amendment proposal hash drifted');
  }
  const rebuilt = buildL2PolicyScopeAmendmentProposal({
    domainId: value.domainId,
    operationId: value.operationId,
    currentPolicy: value.currentPolicy,
    currentPolicyRows: value.currentPolicyRows,
    targetPolicyVersion: value.targetPolicy?.policyVersion,
    sourceIdentity: value.sourceIdentity,
    serverFingerprint: value.serverFingerprint,
    predecessorL1Evidence: value.predecessorL1Evidence,
    authorizationReference: value.authorizationReference,
    generatedAt: value.generatedAt,
  });
  if (stableJson(rebuilt) !== stableJson(value)) {
    throw new Error('L2 policy scope amendment proposal does not match its exact registered scope');
  }
  return true;
}

function addedScopesFor(domainId) {
  const tables = domainId === 'items' ? ITEM_OWNED_TABLES : ARMOR_OWNED_TABLES;
  return tables.map(([databaseRole, table]) => ({
    databaseRole,
    table,
    fieldGroup: 'canonical_owned_rows',
    logicalPredicateHash: hashCanonical({
      schemaVersion: 1,
      domainId,
      databaseRole,
      table,
      ownerPredicateId: `${domainId}.${databaseRole}.${table}.stable-owner-v1`,
    }),
  }));
}

function normalizeCurrentPolicy(value, domainId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.domainId !== domainId || value.level !== 'L2' || value.operationalState !== 'ACTIVE') {
    throw new Error('current policy must be exact ACTIVE L2 for the requested domain');
  }
  const policyVersion = requirePositiveInteger(value.policyVersion, 'current policyVersion');
  if (policyVersion < 2) throw new Error('current policy must be a promoted L2 version');
  const policyHash = requireHash(value.policyHash, 'current policyHash');
  const policySetHash = requireHash(value.policySetHash, 'current policySetHash');
  const policyJson = requirePlainObject(value.policyJson, 'current policyJson');
  if (computePolicyHash(policyJson) !== policyHash) throw new Error('current policy JSON hash drifted');
  if (!Array.isArray(policyJson.ownedTables)) throw new Error('current policy ownedTables are required');
  return Object.freeze({
    domainId,
    policyVersion,
    policyHash,
    policySetHash,
    level: 'L2',
    operationalState: 'ACTIVE',
    policyJson: JSON.parse(JSON.stringify(policyJson)),
  });
}

function normalizeOwnedScopeSequence(value) {
  if (!Array.isArray(value)) throw new Error('ownedTables must be an array');
  return value.map((scope) => ({
    databaseRole: requireText(scope?.databaseRole, 'owned table databaseRole'),
    table: requireText(scope?.table, 'owned table table'),
    fieldGroup: scope?.fieldGroup ?? 'all_columns',
    ...(scope?.logicalPredicateHash == null ? {} : { logicalPredicateHash: scope.logicalPredicateHash }),
  }));
}

function normalizePolicyRows(value) {
  const seen = new Set();
  return value.map((row, index) => {
    const domainId = requireText(row?.domainId, `currentPolicyRows[${index}].domainId`);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(domainId)) {
      throw new Error(`currentPolicyRows[${index}].domainId is invalid`);
    }
    if (seen.has(domainId)) throw new Error('current policy rows contain duplicate domains');
    seen.add(domainId);
    return {
      domainId,
      policyVersion: requirePositiveInteger(row.policyVersion, `${domainId} policyVersion`),
      policyHash: requireHash(row.policyHash, `${domainId} policyHash`),
    };
  });
}

function normalizeSourceIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('current source, dependency, formal, and consumer admission identity is required');
  }
  return Object.freeze({
    schemaVersion: 1,
    sourceSnapshotHash: requireHash(value.sourceSnapshotHash, 'sourceSnapshotHash'),
    dependencyEvidenceHash: requireHash(value.dependencyEvidenceHash, 'dependencyEvidenceHash'),
    formalReadbackHash: requireHash(value.formalReadbackHash, 'formalReadbackHash'),
    consumerReadbackHash: requireHash(value.consumerReadbackHash, 'consumerReadbackHash'),
  });
}

function normalizePredecessorL1Evidence(value, currentPolicy) {
  const policyVersion = requirePositiveInteger(value?.policyVersion, 'predecessor L1 policyVersion');
  const policyHash = requireHash(value?.policyHash, 'predecessor L1 policyHash');
  const policySetHash = requireHash(value?.policySetHash, 'predecessor L1 policySetHash');
  if (policyVersion >= currentPolicy.policyVersion) throw new Error('predecessor L1 policy must precede current L2');
  if (!Array.isArray(value?.runs) || value.runs.length < 3) {
    throw new Error('three distinct committed L1 full-reconciliation runs are required');
  }
  const seen = new Set();
  const runs = value.runs.map((run, index) => {
    const runId = requireText(run?.runId, `predecessor L1 run ${index} ID`);
    if (seen.has(runId)) throw new Error('predecessor L1 evidence contains a duplicate run');
    seen.add(runId);
    const bundleFileSha256 = requireHash(run?.bundleFileSha256, `${runId} bundle file hash`);
    const reconciliationSha256 = requireHash(run?.reconciliationSha256, `${runId} reconciliation hash`);
    if (run?.fullReconciliation !== true) throw new Error(`${runId} full reconciliation evidence is required`);
    return Object.freeze({ runId, bundleFileSha256, reconciliationSha256, fullReconciliation: true });
  });
  return Object.freeze({ policyVersion, policyHash, policySetHash, runs: Object.freeze(runs) });
}

function requireDomain(value, label = 'domainId') {
  const domainId = requireText(value, label);
  if (!DOMAINS.includes(domainId)) throw new Error(`unsupported policy scope amendment domain: ${domainId}`);
  return domainId;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

function requireHash(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be an ISO timestamp`);
  return timestamp;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value) {
  return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}
