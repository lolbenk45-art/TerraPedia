import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID,
  ITEM_SOURCE_RELATION_RECOVERY_ALLOW_LIST,
  buildItemSourceRelationRecoveryPlan,
  buildRelationSourceRecoveryStatements,
} from './recover-item-source-relations-from-maint.mjs';

test('builds a source-relation recovery plan with an exact five-table write boundary', () => {
  const plan = buildItemSourceRelationRecoveryPlan({
    sourceBundleSha256: `sha256:${'a'.repeat(64)}`,
    sourceFactCount: 6722,
    sourceDetailCount: 6722,
    shopRelationCount: 938,
    lootRelationCount: 1542,
  });

  assert.equal(plan.operationId, ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID);
  assert.equal(plan.databaseWrites, true);
  assert.equal(plan.networkAccess, false);
  assert.deepEqual(plan.allowList, [...ITEM_SOURCE_RELATION_RECOVERY_ALLOW_LIST]);
  assert.deepEqual(plan.counts, {
    itemSourceFacts: 6722,
    itemSourceDetails: 6722,
    itemNpcShopRelations: 938,
    itemNpcLootRelations: 1542,
  });
});

test('recovery statements contain no broad relation snapshot tables', () => {
  const statements = buildRelationSourceRecoveryStatements();
  const sql = statements.join('\n');
  assert.match(sql, /item_source_facts/);
  assert.match(sql, /item_source_details/);
  assert.match(sql, /item_npc_shop_relations/);
  assert.match(sql, /item_npc_loot_relations/);
  assert.match(sql, /item_npc_relation_audits/);
  assert.doesNotMatch(sql, /TRUNCATE TABLE `(?:relation_items|projection_items|relation_bosses|projection_bosses|item_category_assignments)`/);
});
