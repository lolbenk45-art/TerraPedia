import { createHash } from 'node:crypto';

// Planning descriptors only. Runtime authority comes from a registered executor.
const ARMOR_TABLES = Object.freeze([
  'projection_armor_sets',
]);

const BUFF_TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);

const SHIMMER_TRANSFORM_TABLES = Object.freeze([
  'shimmer_item_transforms',
  'shimmer_decraft_rules',
  'shimmer_entity_transforms',
  'shimmer_npc_transforms',
]);

const SHIMMER_CROSS_OWNER_SCOPES = Object.freeze([
  Object.freeze({ capability: 'town_npc_maintenance', databaseRole: 'local', table: 'world_contexts', fieldGroup: 'shimmer_context', logicalPredicate: 'code=SHIMMER', logicalPredicateHash: hashPredicate('code=SHIMMER') }),
  Object.freeze({ capability: 'items', databaseRole: 'local', table: 'entity_source_snapshots', fieldGroup: 'shimmer_source_lineage', logicalPredicate: 'provider=wiki_zh,source_page=微光', logicalPredicateHash: hashPredicate('provider=wiki_zh,source_page=微光') }),
]);

function hashPredicate(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function requireTables(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length
      || value.some((table) => typeof table !== 'string')
      || new Set(value).size !== expected.length
      || expected.some((table) => !value.includes(table))) {
    throw new Error(`${label} must declare the exact bounded table set`);
  }
  return Object.freeze([...expected]);
}

export function buildArmorCanonicalRepairContract({ ownerCapability = 'armor_sets', tables = ARMOR_TABLES, projectionKey = 'text_key+relation_record_key+source_key' } = {}) {
  if (ownerCapability !== 'armor_sets') throw new Error('Armor repair must use the armor_sets owner capability');
  if (projectionKey !== 'text_key+relation_record_key+source_key') throw new Error('Armor repair requires the stable source/relation/text key');
  return Object.freeze({ schemaVersion: 1, domainId: 'armor_sets', ownerCapability, tables: requireTables(tables, ARMOR_TABLES, 'Armor repair'), projectionKey, mode: 'incremental-update-preserve-unmatched', executable: false });
}

export function buildBuffCanonicalRepairContract({ ownerCapability = 'buffs', tables = BUFF_TABLES, requiresPageImmunity = true } = {}) {
  if (ownerCapability !== 'buffs') throw new Error('Buff repair must use the buffs owner capability');
  if (requiresPageImmunity !== true) throw new Error('Buff repair requires page immunity evidence');
  return Object.freeze({
    schemaVersion: 1, domainId: 'buffs', ownerCapability,
    tables: requireTables(tables, BUFF_TABLES, 'Buff repair'), requiresPageImmunity,
    mode: 'bounded-upsert-no-broad-clear', executable: false,
    managedImagePolicyBinding: 'registered-executor-runtime-config-required',
  });
}

export function buildShimmerCrossOwnerRepairContract({ ownerCapability = 'shimmer', transformTables = SHIMMER_TRANSFORM_TABLES, crossOwnerScopes = SHIMMER_CROSS_OWNER_SCOPES, ownerApprovals = [] } = {}) {
  if (ownerCapability !== 'shimmer') throw new Error('Shimmer transform owner capability is required');
  const transforms = requireTables(transformTables, SHIMMER_TRANSFORM_TABLES, 'Shimmer transform repair');
  if (!Array.isArray(crossOwnerScopes) || crossOwnerScopes.length !== SHIMMER_CROSS_OWNER_SCOPES.length) throw new Error('Shimmer cross-owner scopes are required');
  for (const expected of SHIMMER_CROSS_OWNER_SCOPES) {
    const actual = crossOwnerScopes.find((scope) => scope?.table === expected.table);
    if (!actual || actual.capability !== expected.capability || actual.databaseRole !== expected.databaseRole || actual.fieldGroup !== expected.fieldGroup || actual.logicalPredicate !== expected.logicalPredicate || actual.logicalPredicateHash !== expected.logicalPredicateHash) throw new Error(`Shimmer cross-owner scope is invalid for ${expected.table}`);
  }
  if (!Array.isArray(ownerApprovals) || !ownerApprovals.includes('town_npc_maintenance') || !ownerApprovals.includes('items')) throw new Error('Shimmer cross-owner owner approvals are required');
  return Object.freeze({ schemaVersion: 1, domainId: 'shimmer', ownerCapability, transformTables: transforms, crossOwnerScopes: Object.freeze(crossOwnerScopes.map((scope) => Object.freeze({ ...scope }))), ownerApprovals: Object.freeze([...ownerApprovals]), mode: 'partitioned-cross-owner-reconciliation-required' });
}

export function assertCanonicalOwnershipRepairBeforeApply({ contract } = {}) {
  if (!contract || typeof contract !== 'object') throw new Error('canonical ownership repair contract is required');
  throw new Error('fresh ownership repair packet and active fences must be verified by a registered executor; draft metadata is not authorization');
}

export { ARMOR_TABLES, BUFF_TABLES, SHIMMER_TRANSFORM_TABLES, SHIMMER_CROSS_OWNER_SCOPES };
