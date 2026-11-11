import { createHash } from 'node:crypto';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const GENERATION_ID_PATTERN = /^(?:[a-f0-9]{64}|sha256:[a-f0-9]{64})$/;
const TRANSFORM_TABLES = Object.freeze([
  'shimmer_item_transforms',
  'shimmer_decraft_rules',
  'shimmer_entity_transforms',
  'shimmer_npc_transforms',
]);

function predicate(expression) {
  return `sha256:${createHash('sha256').update(expression, 'utf8').digest('hex')}`;
}

export const SHIMMER_PARTITION_SCOPES = Object.freeze([
  Object.freeze({ capability: 'town_npc_maintenance', databaseRole: 'local', table: 'world_contexts', fieldGroup: 'shimmer_context', logicalPredicate: 'code=SHIMMER', logicalPredicateHash: predicate('code=SHIMMER') }),
  Object.freeze({ capability: 'items', databaseRole: 'local', table: 'entity_source_snapshots', fieldGroup: 'shimmer_source_lineage', logicalPredicate: 'provider=wiki_zh,source_page=微光', logicalPredicateHash: predicate('provider=wiki_zh,source_page=微光') }),
  ...TRANSFORM_TABLES.map((table) => Object.freeze({ capability: 'shimmer', databaseRole: 'local', table, fieldGroup: 'shimmer_source_page', logicalPredicate: 'provider=wiki_zh,source_page=微光', logicalPredicateHash: predicate(`shimmer:${table}:provider=wiki_zh,source_page=微光`) })),
]);

export function getVerifiedShimmerPartitionScope(scope) {
  return SHIMMER_PARTITION_SCOPES.find((expected) => (
    scope?.databaseRole === expected.databaseRole && scope.table === expected.table
    && scope.fieldGroup === expected.fieldGroup && scope.logicalPredicateHash === expected.logicalPredicateHash
  )) ?? null;
}

export function matchesShimmerPartitionRow(scope, row) {
  const definition = getVerifiedShimmerPartitionScope(scope);
  if (!definition) throw new Error('Shimmer row partition requires an exact registered scope');
  if (definition.table === 'world_contexts') return row?.code === 'SHIMMER';
  if (definition.table === 'entity_source_snapshots') return row?.provider === 'wiki_zh' && row?.source_page === '微光';
  return row?.source_provider === 'wiki_zh' && row?.source_page === '微光' && (row?.deleted === 0 || row?.deleted === '0');
}

export function buildShimmerPartitionPreview(input = {}) {
  const allowed = new Set(['scopes', 'generationId', 'previewSha256', 'schemaVersion', 'executable']);
  if (Object.keys(input).some((key) => !allowed.has(key)) || (input.executable != null && input.executable !== false)
      || (input.schemaVersion != null && input.schemaVersion !== 'shimmer-six-scope-preview/v1')) {
    throw new Error('Shimmer partition preview cannot contain executable authority or fences');
  }
  const scopes = assertScopes(input.scopes);
  if (!GENERATION_ID_PATTERN.test(String(input.generationId ?? '')) || !HASH_PATTERN.test(String(input.previewSha256 ?? ''))) {
    throw new Error('Shimmer partition preview generation and preview identities are required');
  }
  return deepFreeze({ schemaVersion: 'shimmer-six-scope-preview/v1', executable: false,
    scopes, generationId: input.generationId, previewSha256: input.previewSha256 });
}

export function buildShimmerPartitionBundle({ scopes, ownerApprovals, ownerCapabilities, fences, generationId, previewSha256 } = {}) {
  const normalizedScopes = assertScopes(scopes);
  if (!GENERATION_ID_PATTERN.test(String(generationId ?? '')) || !HASH_PATTERN.test(String(previewSha256 ?? ''))) {
    throw new Error('Shimmer partition generation and preview identities are required');
  }
  // These are declared capabilities, not independently verified authority.
  // Accept the normalized representation on subsequent bundle validation.
  const approvals = [...new Set(ownerApprovals ?? ownerCapabilities ?? [])].sort();
  if (ownerApprovals != null && ownerCapabilities != null
      && JSON.stringify(approvals) !== JSON.stringify([...new Set(ownerCapabilities)].sort())) {
    throw new Error('Shimmer owner approval capabilities disagree');
  }
  for (const capability of ['items', 'shimmer', 'town_npc_maintenance']) {
    if (!approvals.includes(capability)) throw new Error(`Shimmer owner approval is missing: ${capability}`);
  }
  const normalizedFences = Array.isArray(fences) ? fences.map((fence) => ({ ...fence })) : [];
  if (normalizedFences.length !== normalizedScopes.length) throw new Error('Shimmer six-scope fences are required');
  for (const scope of normalizedScopes) {
    const matching = normalizedFences.filter((fence) => fence.databaseRole === scope.databaseRole
      && fence.table === scope.table && fence.logicalPredicateHash === scope.logicalPredicateHash
      && typeof fence.fenceToken === 'string' && fence.fenceToken.trim()
      && Number.isSafeInteger(Number(fence.generation)) && Number(fence.generation) >= 0);
    if (matching.length !== 1) throw new Error(`Shimmer fence is missing or ambiguous: ${scope.table}`);
  }
  return deepFreeze({
    schemaVersion: 'shimmer-six-scope-partition/v1',
    domainId: 'shimmer',
    executable: true,
    scopes: normalizedScopes,
    ownerCapabilities: approvals,
    fences: normalizedFences,
    generationId,
    previewSha256,
  });
}

function assertScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length !== SHIMMER_PARTITION_SCOPES.length) {
    throw new Error('Shimmer partition requires all six scopes');
  }
  return SHIMMER_PARTITION_SCOPES.map((expected) => {
    const actual = scopes.find((scope) => scope?.table === expected.table);
    if (!actual || JSON.stringify({ ...actual }) !== JSON.stringify({ ...expected })) {
      throw new Error(`Shimmer partition scope is invalid: ${expected.table}`);
    }
    return { ...expected };
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export { TRANSFORM_TABLES as SHIMMER_PARTITION_TRANSFORM_TABLES };
