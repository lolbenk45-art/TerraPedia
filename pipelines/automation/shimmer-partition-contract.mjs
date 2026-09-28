import { createHash } from 'node:crypto';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
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

export function buildShimmerPartitionBundle({ scopes, ownerApprovals, fences, generationId, previewSha256 } = {}) {
  const normalizedScopes = assertScopes(scopes);
  if (!HASH_PATTERN.test(String(generationId ?? '')) || !HASH_PATTERN.test(String(previewSha256 ?? ''))) {
    throw new Error('Shimmer partition generation and preview identities are required');
  }
  const approvals = [...new Set(ownerApprovals ?? [])].sort();
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
