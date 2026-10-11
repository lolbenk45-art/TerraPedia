import { createHash } from 'node:crypto';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const FROZEN_SOURCE_ROOT = 'reports/authorization/canonical/';

export const SUPPLEMENTARY_L1_DOMAINS = Object.freeze([
  'audio',
  'bosses',
  'shimmer',
]);

export const INDEPENDENT_L1_DOMAINS = Object.freeze([
  'items',
  'npcs',
  'buffs',
  'projectiles',
  'armor_sets',
]);

const GOVERNED_L1_DOMAINS = Object.freeze([
  ...INDEPENDENT_L1_DOMAINS,
  ...SUPPLEMENTARY_L1_DOMAINS,
]);

export const SUPPLEMENTARY_EXECUTION_MODES = Object.freeze([
  'MANUAL_OWNER_L1',
  'ACTIVATION_GATED_AUTO',
]);

const OPERATION_BY_DOMAIN = Object.freeze({
  items: 'automation-items-l1',
  npcs: 'automation-npcs-l1',
  buffs: 'automation-buffs-l1',
  projectiles: 'automation-projectiles-l1',
  armor_sets: 'automation-armor-sets-l1',
  audio: 'automation-audio-first-l1',
  bosses: 'automation-bosses-first-l1',
  shimmer: 'automation-shimmer-first-l1',
});

const OWNED_TABLES_BY_DOMAIN = Object.freeze({
  items: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'items' }),
  ]),
  npcs: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'npcs' }),
  ]),
  buffs: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'buffs' }),
    Object.freeze({ databaseRole: 'local', table: 'buff_source_items' }),
  ]),
  projectiles: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'projectiles' }),
  ]),
  armor_sets: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'armor_sets' }),
    Object.freeze({ databaseRole: 'local', table: 'armor_set_items' }),
  ]),
  audio: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'audio_assets' }),
    Object.freeze({ databaseRole: 'local', table: 'audio_asset_links' }),
  ]),
  bosses: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'boss_groups' }),
    Object.freeze({ databaseRole: 'local', table: 'npcs' }),
  ]),
  shimmer: Object.freeze([
    Object.freeze({ databaseRole: 'local', table: 'shimmer_item_transforms' }),
    Object.freeze({ databaseRole: 'local', table: 'shimmer_decraft_rules' }),
    Object.freeze({ databaseRole: 'local', table: 'shimmer_entity_transforms' }),
    Object.freeze({ databaseRole: 'local', table: 'shimmer_npc_transforms' }),
  ]),
});

export function buildSupplementaryL1Bundle(input = {}) {
  const domainId = requireDomain(input.domainId);
  const operationId = requireText(input.operationId, 'operationId');
  if (operationId !== OPERATION_BY_DOMAIN[domainId]) {
    throw new Error(`operationId must match the ${domainId} first L1 operation`);
  }
  const runId = requireText(input.runId, 'runId');
  if (!new RegExp(`^${domainId}_l1_[a-z0-9_]{8,72}$`).test(runId)) {
    throw new Error(`runId must use the bounded ${domainId}_l1 identity`);
  }
  const generatedAt = requireTimestamp(input.generatedAt, 'generatedAt');
  const executionMode = normalizeExecutionMode(input.executionMode);
  const policy = normalizePolicy(input.policy, domainId, executionMode);
  const ownedTables = normalizeOwnedTables(input.ownedTables);
  assertSupplementaryOwnedTables(domainId, ownedTables);
  if (executionMode === 'ACTIVATION_GATED_AUTO') {
    assertAutomaticPolicyOwnedTables(policy, ownedTables);
  }
  const baseline = normalizeBaseline(input.baseline, ownedTables);
  const source = normalizeSource(input.source);
  const sourceDispatchIdentity = input.sourceDispatchIdentity == null
    ? null
    : normalizeSourceDispatchIdentity(input.sourceDispatchIdentity);
  if (executionMode === 'MANUAL_OWNER_L1' && sourceDispatchIdentity != null) {
    throw new Error('manual Owner bundles must not carry a scheduler source dispatch identity');
  }
  const reconciliationInput = normalizeReconciliationInput(input.reconciliationInput);
  const importPlan = cloneObject(input.importPlan, 'importPlan');
  const baselineFingerprint = hashJson(baseline);
  const logicalDiffIdentity = {
    baselineFingerprint,
    ownedTables,
    sourceSha256: source.sha256,
    importPlan,
  };
  const logicalDiffHash = hashJson(logicalDiffIdentity);
  const evidenceHash = hashJson({ source, importPlan });
  const decisionHash = hashJson({
    runId,
    domainId,
    decision: executionMode === 'ACTIVATION_GATED_AUTO' ? 'AUTO_APPLY_ACTIVATED' : 'REQUIRES_OWNER_L1',
    policySetHash: policy.policySetHash,
    evidenceHash,
    logicalDiffHash,
    baselineFingerprint,
  });
  const body = {
    schemaVersion: 1,
    operationId,
    runId,
    domainId,
    databaseName: 'terria_v1_local',
    generatedAt,
    approvalMode: executionMode === 'ACTIVATION_GATED_AUTO' ? 'AUTO_APPLY_ACTIVATED' : 'APPROVED_OWNER_L1',
    executionMode,
    policy,
    baseline,
    baselineFingerprint,
    source,
    ...(sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity }),
    evidenceHash,
    logicalDiffIdentity,
    logicalDiffHash,
    decisionHash,
    ownedTables,
    importPlan,
    ...(reconciliationInput == null ? {} : { reconciliationInput }),
  };
  return deepFreeze({ ...body, bundleHash: hashJson(body) });
}

export function validateSupplementaryL1Bundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('supplementary L1 bundle must be an object');
  }
  const { bundleHash, ...body } = value;
  requireHash(bundleHash, 'bundleHash');
  if (hashJson(body) !== bundleHash) {
    throw new Error('supplementary L1 bundle hash or content mismatch');
  }
  if (value.schemaVersion !== 1 || value.databaseName !== 'terria_v1_local'
      || !SUPPLEMENTARY_EXECUTION_MODES.includes(value.executionMode)) {
    throw new Error('supplementary L1 bundle execution identity is invalid');
  }
  const rebuilt = buildSupplementaryL1Bundle({
    operationId: value.operationId,
    runId: value.runId,
    domainId: value.domainId,
    generatedAt: value.generatedAt,
    policy: value.policy,
    baseline: value.baseline,
    source: value.source,
    sourceDispatchIdentity: value.sourceDispatchIdentity,
    ownedTables: value.ownedTables,
    importPlan: value.importPlan,
    executionMode: value.executionMode,
    reconciliationInput: value.reconciliationInput,
  });
  if (rebuilt.bundleHash !== bundleHash
      || rebuilt.baselineFingerprint !== value.baselineFingerprint
      || rebuilt.evidenceHash !== value.evidenceHash
      || rebuilt.logicalDiffHash !== value.logicalDiffHash
      || rebuilt.decisionHash !== value.decisionHash) {
    throw new Error('supplementary L1 bundle derived identity is invalid');
  }
  return true;
}

function normalizeExecutionMode(value) {
  const mode = value == null ? 'MANUAL_OWNER_L1' : requireText(value, 'executionMode');
  if (!SUPPLEMENTARY_EXECUTION_MODES.includes(mode)) {
    throw new Error('supplementary execution mode must be MANUAL_OWNER_L1 or ACTIVATION_GATED_AUTO');
  }
  return mode;
}

function normalizeSourceDispatchIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sourceDispatchIdentity must be an object');
  }
  const sourceFingerprint = requireHash(value.sourceFingerprint, 'sourceDispatchIdentity.sourceFingerprint');
  const sourceRunIdentity = requireTimestamp(value.sourceRunIdentity, 'sourceDispatchIdentity.sourceRunIdentity');
  const sourceContentIdentity = requireHash(value.sourceContentIdentity, 'sourceDispatchIdentity.sourceContentIdentity');
  return { sourceFingerprint, sourceRunIdentity, sourceContentIdentity };
}

export function assertSupplementaryOwnedTables(domainId, ownedTables) {
  const domain = requireDomain(domainId);
  const normalized = normalizeOwnedTables(ownedTables);
  const physicalScopes = normalized.map(({ databaseRole, table }) => ({ databaseRole, table }));
  if (JSON.stringify(sortOwnedTables(physicalScopes))
      !== JSON.stringify(sortOwnedTables(OWNED_TABLES_BY_DOMAIN[domain]))) {
    throw new Error(`supplementary ${domain} owned table set is invalid`);
  }
  return true;
}

function normalizePolicy(policy, domainId, executionMode = 'MANUAL_OWNER_L1') {
  const expectedLevel = executionMode === 'ACTIVATION_GATED_AUTO' ? 'L2' : 'L1';
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || policy.domainId !== domainId
      || policy.level !== expectedLevel
      || policy.operationalState !== 'ACTIVE') {
    throw new Error(`supplementary ${executionMode} policy must be exact ${expectedLevel}/ACTIVE`);
  }
  if (!Number.isSafeInteger(policy.policyVersion) || policy.policyVersion < 1) {
    throw new Error('policyVersion must be a positive integer');
  }
  const normalized = {
    domainId,
    level: expectedLevel,
    operationalState: 'ACTIVE',
    policyVersion: policy.policyVersion,
    policyHash: requireHash(policy.policyHash, 'policyHash'),
    policySetHash: requireHash(policy.policySetHash, 'policySetHash'),
  };
  if (policy.policyJson != null) {
    if (!policy.policyJson || typeof policy.policyJson !== 'object' || Array.isArray(policy.policyJson)) {
      throw new Error('policyJson must be an object');
    }
    normalized.policyJson = JSON.parse(JSON.stringify(policy.policyJson));
  }
  return normalized;
}

function normalizeBaseline(baseline, ownedTables) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error('baseline is required');
  }
  const environmentId = requireText(baseline.environmentId, 'baseline.environmentId');
  if (!Array.isArray(baseline.generations)) {
    throw new Error('baseline.generations must be an array');
  }
  const generationByScope = new Map(baseline.generations.map((row) => [
    `${row?.databaseRole}:${row?.table}`,
    Number(row?.generation),
  ]));
  const generations = ownedTables.map((scope) => {
    const generation = generationByScope.get(`${scope.databaseRole}:${scope.table}`);
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error(`baseline generation is invalid: ${scope.databaseRole}.${scope.table}`);
    }
    return { ...scope, generation };
  });
  if (generationByScope.size !== ownedTables.length) {
    throw new Error('baseline generations contain an undeclared table');
  }
  const dependencyTables = normalizeDependencyTables(baseline.dependencyTables);
  return {
    environmentId,
    generations,
    projectionHash: requireHash(baseline.projectionHash, 'baseline.projectionHash'),
    ...(dependencyTables == null ? {} : { dependencyTables }),
  };
}

function normalizeDependencyTables(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('baseline.dependencyTables must be an object');
  }
  const allowed = new Set(['items', 'npcs', 'categories', 'npcZhMap', 'audioBgmDisplayNames']);
  const result = {};
  for (const [name, rows] of Object.entries(value)) {
    if (!allowed.has(name)) throw new Error(`baseline.dependencyTables contains an unsupported table: ${name}`);
    if (!Array.isArray(rows)) throw new Error(`baseline.dependencyTables.${name} must be an array`);
    result[name] = JSON.parse(JSON.stringify(rows));
  }
  return result;
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('source is required');
  }
  const sourcePath = requireText(source.path, 'source.path').replaceAll('\\', '/');
  if (!sourcePath.startsWith(FROZEN_SOURCE_ROOT)
      || sourcePath.includes('/../')
      || sourcePath.endsWith('.latest.json')
      || sourcePath.includes('.latest.')) {
    throw new Error('source.path must be a frozen authorization artifact');
  }
  return { path: sourcePath, sha256: requireHash(source.sha256, 'source.sha256') };
}

function normalizeReconciliationInput(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reconciliationInput must be an object');
  }
  const fields = ['sourceCoveragePath', 'ownedTableReadbackPath', 'attemptStatePath', 'outputPath'];
  const result = {};
  for (const field of fields) {
    const normalized = requireText(value[field], `reconciliationInput.${field}`).replaceAll('\\', '/');
    if (!normalized.startsWith('reports/') || normalized.includes('..') || normalized.endsWith('.latest.json')) {
      throw new Error(`reconciliationInput.${field} must be a frozen reports path`);
    }
    result[field] = normalized;
  }
  return result;
}

function normalizeOwnedTables(ownedTables) {
  if (!Array.isArray(ownedTables) || ownedTables.length === 0) {
    throw new Error('ownedTables must be a non-empty array');
  }
  const keys = new Set();
  return ownedTables.map((entry) => {
    const databaseRole = requireText(entry?.databaseRole, 'ownedTables.databaseRole');
    const table = requireText(entry?.table, 'ownedTables.table');
    const fieldGroup = entry?.fieldGroup == null
      ? null
      : requireText(entry.fieldGroup, 'ownedTables.fieldGroup');
    const logicalPredicateHash = entry?.logicalPredicateHash == null
      ? null
      : requireHash(entry.logicalPredicateHash, 'ownedTables.logicalPredicateHash');
    if (logicalPredicateHash != null && fieldGroup == null) {
      throw new Error('ownedTables.logicalPredicateHash requires ownedTables.fieldGroup');
    }
    const result = {
      databaseRole,
      table,
      ...(fieldGroup == null ? {} : { fieldGroup }),
      ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
    };
    const key = `${databaseRole}:${table}:${fieldGroup ?? ''}:${logicalPredicateHash ?? ''}`;
    if (keys.has(key)) throw new Error('ownedTables contains duplicate scopes');
    keys.add(key);
    return result;
  });
}

function assertAutomaticPolicyOwnedTables(policy, ownedTables) {
  const policyScopes = normalizeAutomaticPolicyScopes(policy?.policyJson?.ownedTables, 'policyJson.ownedTables');
  const bundleScopes = normalizeAutomaticPolicyScopes(ownedTables, 'ownedTables');
  if (JSON.stringify(policyScopes) !== JSON.stringify(bundleScopes)) {
    throw new Error('automatic owned table scopes must exactly match policyJson.ownedTables');
  }
  for (const scope of policyScopes) {
    if (scope.table === 'npcs' && scope.logicalPredicateHash == null) {
      throw new Error('automatic shared npcs scope requires a logical predicate hash');
    }
  }
}

function normalizeAutomaticPolicyScopes(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} are required for automatic execution`);
  }
  const seen = new Set();
  // Preserve the persisted policy order.  Scope order is part of the bundle
  // identity and must not be normalized away before exact comparison.
  return value.map((entry) => {
    const databaseRole = requireText(entry?.databaseRole, `${label}.databaseRole`);
    const table = requireText(entry?.table, `${label}.table`);
    const fieldGroup = requireText(entry?.fieldGroup, `${label}.fieldGroup`);
    const logicalPredicateHash = entry?.logicalPredicateHash == null
      ? null
      : requireHash(entry.logicalPredicateHash, `${label}.logicalPredicateHash`);
    const scope = {
      databaseRole,
      table,
      fieldGroup,
      ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
    };
    const key = `${databaseRole}:${table}:${fieldGroup}:${logicalPredicateHash ?? ''}`;
    if (seen.has(key)) throw new Error(`${label} contains duplicate scopes`);
    seen.add(key);
    return scope;
  });
}

function sortOwnedTables(value) {
  return [...value].sort(compareOwnedTables);
}

function compareOwnedTables(left, right) {
  return `${left.databaseRole}:${left.table}:${left.fieldGroup ?? ''}:${left.logicalPredicateHash ?? ''}`
    .localeCompare(`${right.databaseRole}:${right.table}:${right.fieldGroup ?? ''}:${right.logicalPredicateHash ?? ''}`);
}

function requireDomain(value) {
  const domain = requireText(value, 'domainId');
  if (!GOVERNED_L1_DOMAINS.includes(domain)) {
    throw new Error(`unsupported governed L1 domain: ${domain}`);
  }
  return domain;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function cloneObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return JSON.parse(JSON.stringify(value));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
