import { createHash } from 'node:crypto';

export const ITEMS_CANONICAL_V2_OPERATION_ID = 'automation-items-l2-canonical-v2';
const HASH = /^sha256:[a-f0-9]{64}$/;
const STAGES = Object.freeze(['landing', 'maint', 'relation', 'projection', 'local']);
const TABLES = Object.freeze([
  ['local', 'source_dataset_landings'], ['local', 'category'], ['local', 'item_images'],
  ['local', 'item_acquisition_sources'], ['local', 'recipes'], ['local', 'recipe_ingredients'],
  ['local', 'recipe_stations'], ['local', 'item_biomes'], ['local', 'biome_resources'],
  ['maint', 'maint_items'], ['maint', 'maint_item_categories'], ['maint', 'maint_item_images'],
  ['maint', 'maint_item_recipes'], ['maint', 'maint_item_sources'], ['maint', 'maint_item_biomes'],
  ['relation', 'relation_items'], ['relation', 'relation_item_images'], ['relation', 'relation_item_rarities'],
  ['relation', 'category_nodes'], ['relation', 'item_category_assignments'], ['relation', 'item_recipe_heads'],
  ['relation', 'item_recipe_ingredients'], ['relation', 'item_recipe_stations'], ['relation', 'item_source_facts'],
  ['relation', 'item_source_details'], ['relation', 'item_npc_shop_relations'], ['relation', 'item_npc_loot_relations'],
  ['relation', 'item_npc_relation_audits'], ['relation', 'item_biome_relations'], ['relation', 'projection_items'],
]);

export function buildItemsCanonicalV2ExecutionPlan({ source, ownedTables, dependencyEvidence, currentPolicy } = {}) {
  if (!source || typeof source !== 'object' || !HASH.test(source.sha256 ?? '')) {
    throw new Error('Items canonical V2 requires one immutable source snapshot');
  }
  if (!currentPolicy || currentPolicy.level !== 'L2' || currentPolicy.operationalState !== 'ACTIVE') {
    throw new Error('Items canonical V2 requires an active L2 policy');
  }
  if (!dependencyEvidence || dependencyEvidence.complete !== true
      || Number(dependencyEvidence.unresolvedCount) !== 0
      || Number(dependencyEvidence.duplicateCount) !== 0) {
    throw new Error('Items canonical V2 requires complete dependency evidence');
  }
  const normalized = normalizeOwnedTables(ownedTables);
  return Object.freeze({
    schemaVersion: 1,
    operationId: ITEMS_CANONICAL_V2_OPERATION_ID,
    domainId: 'items',
    source: Object.freeze({ path: String(source.path ?? ''), sha256: source.sha256 }),
    policy: Object.freeze({ ...currentPolicy }),
    tables: Object.freeze(normalized),
    stageOrder: STAGES,
    deletesAllowed: false,
    retirementsAllowed: false,
  });
}

export async function runItemsCanonicalV2Operation({
  plan,
  readSource,
  runStage,
  readback,
  acknowledge,
} = {}) {
  if (!plan || plan.operationId !== ITEMS_CANONICAL_V2_OPERATION_ID) throw new Error('Items canonical V2 plan is required');
  for (const [name, fn] of Object.entries({ readSource, runStage, readback, acknowledge })) {
    if (typeof fn !== 'function') throw new TypeError(`Items canonical V2 ${name} function is required`);
  }
  const sourcePayload = await readSource({ source: plan.source, plan });
  if (!sourcePayload || typeof sourcePayload !== 'object' || Array.isArray(sourcePayload)) {
    throw new Error('Items canonical V2 source payload is invalid');
  }
  const receipts = [];
  for (const stage of plan.stageOrder) {
    const receipt = await runStage({ stage, plan, sourcePayload });
    if (!receipt || receipt.stage !== stage) throw new Error(`Items canonical V2 ${stage} receipt is invalid`);
    if (Number(receipt.deleted ?? 0) !== 0 || Number(receipt.retired ?? 0) !== 0) {
      throw new Error(`Items canonical V2 ${stage} attempted delete or retirement`);
    }
    if (!HASH.test(receipt.receiptHash ?? '')) throw new Error(`Items canonical V2 ${stage} receipt hash is required`);
    receipts.push(Object.freeze({ ...receipt }));
  }
  const readbackResult = await readback({ plan, receipts });
  if (!readbackResult?.verified) throw new Error('Items canonical V2 independent readback failed');
  await acknowledge({ plan, receipts, readback: readbackResult });
  return Object.freeze({
    schemaVersion: 1,
    operationId: plan.operationId,
    domainId: plan.domainId,
    status: 'completed',
    receipts: Object.freeze(receipts),
    readback: Object.freeze(readbackResult),
  });
}

function normalizeOwnedTables(value) {
  if (!Array.isArray(value)) throw new Error('Items canonical V2 owned tables are required');
  const expected = new Set(TABLES.map(([databaseRole, table]) => `${databaseRole}.${table}`));
  const seen = new Set();
  const normalized = value.map((scope) => {
    const databaseRole = String(scope?.databaseRole ?? '').trim();
    const table = String(scope?.table ?? '').trim();
    const key = `${databaseRole}.${table}`;
    if (!expected.has(key)) throw new Error(`Items canonical V2 table is outside the exact scope: ${key}`);
    if (seen.has(key)) throw new Error(`Items canonical V2 table scope is duplicated: ${key}`);
    seen.add(key);
    if (scope.fieldGroup !== 'canonical_owned_rows' || !HASH.test(scope.logicalPredicateHash ?? '')) {
      throw new Error(`Items canonical V2 owner predicate is incomplete: ${key}`);
    }
    return { databaseRole, table, fieldGroup: scope.fieldGroup, logicalPredicateHash: scope.logicalPredicateHash };
  });
  if (seen.size !== expected.size) throw new Error('Items canonical V2 owned table set is incomplete');
  return normalized;
}
