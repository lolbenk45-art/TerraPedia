import { createHash, randomBytes } from 'node:crypto';

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^fence:[a-f0-9]{64}$/;
const ALL_COLUMNS_PREDICATE_HASH = `sha256:${createHash('sha256').update('{"kind":"all"}', 'utf8').digest('hex')}`;

export const ARMOR_CANONICAL_POLICY_OWNER_SCOPES = normalizeArmorCanonicalFenceScopes([
  { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
  { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
  { databaseRole: 'local', table: 'source_dataset_landings', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:999a98a657ffb93635aba470b4eeaf475b72c9dbcb37f1e8621e92ea246c5042' },
  { databaseRole: 'maint', table: 'maint_armor_sets', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:b3d912b4105553d8bf41a5ec7d3f32a55ba90633c9d1885e3b3a64f92211ed67' },
  { databaseRole: 'maint', table: 'maint_armor_set_images', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:9d34bade9b33f6a0c099601fad4efcb1ed3a92a3214e9adbc0350cb762e6aebf' },
  { databaseRole: 'relation', table: 'relation_armor_sets', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:a408f4b8a082f1ccf1d48f68bb2e608cdbd8d2c012216afa08bb7716f307f13b' },
  { databaseRole: 'relation', table: 'relation_armor_set_items', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:47e7e0492095b9e78ae08602c850202df7783cdd1ddeb1af5ba1632e39adb3d0' },
  { databaseRole: 'relation', table: 'relation_armor_set_images', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:8679f0163d99cacbbb191784dd422e1eb109f92c51ce748fc96a28573bf1b8f5' },
  { databaseRole: 'relation', table: 'projection_armor_sets', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: 'sha256:699b25cf13beaafbcf9396c60142cb7ba012f92684c2ccb84544a49173ca2032' },
]);

export const ARMOR_CANONICAL_EXECUTION_OWNERSHIP_KEYS = Object.freeze([
  'local.armor_sets',
  'local.armor_set_items',
  'local.source_dataset_landings.armor_sets_raw',
  'local.source_dataset_landings.armor_set_images_raw',
  'maint.maint_armor_sets',
  'maint.maint_armor_set_images',
  'relation.relation_armor_sets',
  'relation.relation_armor_set_items',
  'relation.relation_armor_set_images',
  'relation.projection_armor_sets',
]);

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`Armor ${label} is required`);
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

export function normalizeArmorCanonicalFenceScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) throw new Error('Armor canonical owner scopes are required');
  const seen = new Set();
  const normalized = scopes.map((scope, index) => {
    const databaseRole = text(scope?.databaseRole, `write-fence scope ${index} databaseRole`);
    const table = text(scope?.table, `write-fence scope ${index} table`);
    const fieldGroup = text(scope?.fieldGroup ?? 'all_columns', `write-fence scope ${index} fieldGroup`);
    const logicalPredicateHash = scope?.logicalPredicateHash == null
      ? hashJson({ kind: 'all' })
      : text(scope.logicalPredicateHash, `write-fence scope ${index} logicalPredicateHash`);
    if (!HASH.test(logicalPredicateHash)) throw new Error(`Armor write-fence scope ${index} logicalPredicateHash is invalid`);
    const key = `${databaseRole}\0${table}\0${fieldGroup}\0${logicalPredicateHash}`;
    if (seen.has(key)) throw new Error(`Armor canonical owner scope is duplicated: ${databaseRole}.${table}.${fieldGroup}`);
    seen.add(key);
    return Object.freeze({ databaseRole, table, fieldGroup, logicalPredicateHash });
  });
  return Object.freeze(normalized.sort((left, right) => (
    `${left.databaseRole}\0${left.table}\0${left.fieldGroup}\0${left.logicalPredicateHash}`
      .localeCompare(`${right.databaseRole}\0${right.table}\0${right.fieldGroup}\0${right.logicalPredicateHash}`)
  )));
}

export function armorCanonicalGenerationScopeHash(scope) {
  const normalized = normalizeArmorCanonicalFenceScopes([scope])[0];
  return hashJson({
    databaseRole: normalized.databaseRole,
    table: normalized.table,
    fieldGroup: normalized.fieldGroup,
    logicalPredicateHash: normalized.logicalPredicateHash,
  });
}

export function armorCanonicalMutationGenerationScopeHash(scope) {
  const normalized = normalizeArmorCanonicalFenceScopes([scope])[0];
  return hashJson({
    databaseRole: normalized.databaseRole,
    table: normalized.table,
    fieldGroup: normalized.fieldGroup,
    ...(normalized.logicalPredicateHash === ALL_COLUMNS_PREDICATE_HASH
      ? { logicalPredicate: { kind: 'all' } }
      : { logicalPredicateHash: normalized.logicalPredicateHash }),
  });
}

export function assertArmorCanonicalPolicyScopeCoverage({ policyOwnedTables, executionOwnershipKeys } = {}) {
  const policyScopes = normalizeArmorCanonicalFenceScopes(policyOwnedTables);
  if (!Array.isArray(executionOwnershipKeys) || executionOwnershipKeys.length === 0) {
    throw new Error('Armor canonical execution ownership keys are required');
  }
  const execution = new Set(executionOwnershipKeys.map((value) => text(value, 'Armor execution ownership key')));
  const missing = policyScopes
    .map((scope) => `${scope.databaseRole}.${scope.table}`)
    .filter((key) => !execution.has(key));
  if (missing.length > 0) {
    throw new Error(`Armor canonical execution ownership is missing policy scopes: ${missing.join(', ')}`);
  }
  return Object.freeze({ policyScopeCount: policyScopes.length, executionOwnershipKeyCount: execution.size });
}

export function assertArmorCanonicalExecutionOwnershipCoverage({
  policyOwnedTables = ARMOR_CANONICAL_POLICY_OWNER_SCOPES,
  executionOwnershipKeys = ARMOR_CANONICAL_EXECUTION_OWNERSHIP_KEYS,
} = {}) {
  const policyScopes = normalizeArmorCanonicalFenceScopes(policyOwnedTables);
  if (!Array.isArray(executionOwnershipKeys) || executionOwnershipKeys.length === 0) {
    throw new Error('Armor canonical execution ownership keys are required');
  }
  const actual = new Set(executionOwnershipKeys.map(value => text(value, 'execution ownership key')));
  const expected = new Set();
  for (const scope of policyScopes) {
    if (scope.databaseRole === 'local' && scope.table === 'source_dataset_landings') {
      expected.add('local.source_dataset_landings.armor_sets_raw');
      expected.add('local.source_dataset_landings.armor_set_images_raw');
    } else {
      expected.add(`${scope.databaseRole}.${scope.table}`);
    }
  }
  const missing = [...expected].filter(key => !actual.has(key));
  const extra = [...actual].filter(key => !expected.has(key));
  if (missing.length || extra.length || actual.size !== executionOwnershipKeys.length) {
    throw new Error(`Armor canonical execution ownership differs from policy scopes: missing=${missing.join(',')} extra=${extra.join(',')}`);
  }
  return Object.freeze({ policyScopeCount: policyScopes.length, executionOwnershipKeyCount: actual.size });
}

export function buildArmorCanonicalWriteFenceBindings({
  ownerScopes,
  generations,
  tokenFactory = () => `fence:${randomBytes(32).toString('hex')}`,
  markerFactory = () => randomBytes(32).toString('hex'),
} = {}) {
  const scopes = normalizeArmorCanonicalFenceScopes(ownerScopes);
  if (!Array.isArray(generations)) throw new Error('Armor canonical write-fence generations are required');
  const generationByScope = new Map();
  for (const row of generations) {
    const scope = normalizeArmorCanonicalFenceScopes([row])[0];
    const scopeKey = scopeKeyOf(scope);
    if (generationByScope.has(scopeKey)) throw new Error('Armor canonical write-fence generation is duplicated');
    const generation = Number(row.generation);
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Armor canonical write-fence generation is invalid');
    const schemaHash = row.schemaHash == null
      ? hashJson({ schemaVersion: 1, databaseRole: scope.databaseRole, table: scope.table })
      : text(row.schemaHash, 'write-fence generation schemaHash');
    if (!HASH.test(schemaHash)) throw new Error('Armor canonical write-fence generation schemaHash is invalid');
    generationByScope.set(scopeKey, { generation, schemaHash });
  }
  if (generationByScope.size !== scopes.length) throw new Error('Armor canonical write-fence generations do not cover every owner scope');
  const tokens = new Set();
  const markers = new Set();
  return Object.freeze(scopes.map((scope) => {
    const scopeKey = scopeKeyOf(scope);
    if (!generationByScope.has(scopeKey)) throw new Error(`Armor canonical generation is missing: ${scope.databaseRole}.${scope.table}`);
    const generation = generationByScope.get(scopeKey);
    const beforeGeneration = generation.generation;
    const fenceToken = text(tokenFactory(scope), 'write-fence token');
    const commitMarker = text(markerFactory(scope), 'write-fence commit marker');
    if (!TOKEN.test(fenceToken)) throw new Error('Armor canonical write-fence token format is invalid');
    if (!/^[a-f0-9]{64}$/.test(commitMarker)) throw new Error('Armor canonical write-fence commit marker format is invalid');
    if (tokens.has(fenceToken) || markers.has(commitMarker)) throw new Error('Armor canonical write-fence tokens and markers must be unique');
    tokens.add(fenceToken);
    markers.add(commitMarker);
    return Object.freeze({
      ...scope,
      generationScopeHash: armorCanonicalGenerationScopeHash(scope),
      generationSchemaHash: generation.schemaHash,
      mutationGenerationScopeHash: armorCanonicalMutationGenerationScopeHash(scope),
      fenceToken,
      beforeGeneration,
      committedGeneration: beforeGeneration + 1,
      commitMarker,
    });
  }));
}

export function buildArmorCanonicalFenceCommit({
  runId,
  environmentId = 'local',
  expiresAt,
  ownerScopes = ARMOR_CANONICAL_POLICY_OWNER_SCOPES,
  generations,
  tokenFactory,
  markerFactory,
} = {}) {
  const boundRunId = text(runId, 'canonical fence runId');
  const boundEnvironmentId = text(environmentId, 'canonical fence environmentId');
  const boundExpiry = requireFenceExpiry(expiresAt);
  const bindings = buildArmorCanonicalWriteFenceBindings({ ownerScopes, generations, tokenFactory, markerFactory })
    .map(binding => Object.freeze({
      ...binding,
      environmentId: boundEnvironmentId,
      runId: boundRunId,
      expiresAt: boundExpiry,
    }));
  assertArmorCanonicalFenceBindingCoverage({ ownerScopes, writeFences: bindings });
  const marker = hashJson(bindings);
  return Object.freeze({
    schemaVersion: 'armor-canonical-write-fence-commit/v1',
    generation: 1,
    marker: marker.slice('sha256:'.length),
    environmentId: boundEnvironmentId,
    runId: boundRunId,
    expiresAt: boundExpiry,
    bindings: Object.freeze(bindings),
  });
}

function requireFenceExpiry(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error('Armor canonical fence expiry must be an ISO UTC timestamp');
  }
  return new Date(value).toISOString();
}

export function assertArmorCanonicalWriteFenceBindings({ ownerScopes, writeFences } = {}) {
  const scopes = normalizeArmorCanonicalFenceScopes(ownerScopes);
  if (!Array.isArray(writeFences) || writeFences.length !== scopes.length) {
    throw new Error('Armor canonical write-fence bindings must cover every current policy owner scope');
  }
  const bindings = buildArmorCanonicalWriteFenceBindings({
    ownerScopes: scopes,
    generations: writeFences.map((fence) => ({ ...fence, generation: fence.beforeGeneration })),
    tokenFactory: (scope) => writeFences.find((fence) => sameScope(scope, fence))?.fenceToken,
    markerFactory: (scope) => writeFences.find((fence) => sameScope(scope, fence))?.commitMarker,
  });
  for (let index = 0; index < bindings.length; index += 1) {
    if (!same(bindings[index], writeFences[index])) throw new Error('Armor canonical write-fence binding drifted from owner scopes');
  }
  return bindings;
}

export function assertArmorCanonicalFenceBindingCoverage({ ownerScopes = ARMOR_CANONICAL_POLICY_OWNER_SCOPES, writeFences } = {}) {
  const scopes = normalizeArmorCanonicalFenceScopes(ownerScopes);
  if (!Array.isArray(writeFences) || writeFences.length !== scopes.length) {
    throw new Error('Armor canonical fence bindings must cover every policy owner scope');
  }
  const expected = new Set(scopes.map(scopeKeyOf));
  const seen = new Set();
  const tokens = new Set();
  const markers = new Set();
  for (const fence of writeFences) {
    const scope = normalizeArmorCanonicalFenceScopes([fence])[0];
    const key = scopeKeyOf(scope);
    if (!expected.has(key) || seen.has(key)) throw new Error(`Armor canonical fence binding is foreign or duplicate: ${key}`);
    seen.add(key);
    for (const field of ['fenceToken', 'commitMarker']) text(fence[field], `write-fence ${field}`);
    if (!TOKEN.test(fence.fenceToken) || !/^[a-f0-9]{64}$/.test(fence.commitMarker)) {
      throw new Error(`Armor canonical fence binding format is invalid: ${key}`);
    }
    if (tokens.has(fence.fenceToken) || markers.has(fence.commitMarker)) {
      throw new Error(`Armor canonical fence token or marker is duplicated: ${key}`);
    }
    tokens.add(fence.fenceToken);
    markers.add(fence.commitMarker);
    if (fence.generationScopeHash !== armorCanonicalGenerationScopeHash(scope)
        || !HASH.test(fence.generationSchemaHash ?? '')
        || !HASH.test(fence.mutationGenerationScopeHash ?? '')) {
      throw new Error(`Armor canonical fence scope hash is invalid: ${key}`);
    }
    if (!Number.isSafeInteger(Number(fence.beforeGeneration)) || Number(fence.beforeGeneration) < 0
        || Number(fence.committedGeneration) !== Number(fence.beforeGeneration) + 1) {
      throw new Error(`Armor canonical fence generation is invalid: ${key}`);
    }
  }
  if (seen.size !== expected.size) throw new Error('Armor canonical fence bindings are incomplete');
  return true;
}

export function validateArmorCanonicalFenceCommit(value, { runId = null, environmentId = 'local' } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== 'armor-canonical-write-fence-commit/v1'
      || value.environmentId !== environmentId
      || typeof value.runId !== 'string' || !value.runId.trim()
      || runId != null && value.runId !== runId
      || !Number.isFinite(Date.parse(value.expiresAt ?? ''))
      || value.generation !== 1
      || !Array.isArray(value.bindings)) {
    throw new Error('Armor canonical all-scope fence commit identity is invalid');
  }
  assertArmorCanonicalFenceBindingCoverage({ writeFences: value.bindings });
  if (value.bindings.some(binding => binding.environmentId !== value.environmentId || binding.runId !== value.runId
      || binding.expiresAt !== value.expiresAt)) {
    throw new Error('Armor canonical all-scope fence commit binding identity drifted');
  }
  if (value.marker !== hashJson(value.bindings).slice('sha256:'.length)) {
    throw new Error('Armor canonical all-scope fence commit marker drifted');
  }
  return true;
}

function scopeKeyOf(scope) {
  return `${scope.databaseRole}\0${scope.table}\0${scope.fieldGroup}\0${scope.logicalPredicateHash}`;
}

function sameScope(left, right) {
  return left.databaseRole === right.databaseRole
    && left.table === right.table
    && left.fieldGroup === (right.fieldGroup ?? 'all_columns')
    && left.logicalPredicateHash === (right.logicalPredicateHash ?? hashJson({ kind: 'all' }));
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}
