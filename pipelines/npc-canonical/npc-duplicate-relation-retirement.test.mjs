import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from '../automation/canonical-operation-catalog.mjs';
import {
  buildDuplicateRelationRetirementProposal,
  DUPLICATE_RELATION_RETIREMENT_OPERATION_ID,
} from './npc-duplicate-relation-retirement.mjs';

const TARGET = Object.freeze({
  relation: {
    id: 1551,
    record_key: 'b5988ccf0bab1a14daaeb62ca39fc176e169ab3cd0fbe7c26374b29b0a60b278',
    source_fact_key: '9326c9f23ae5ca8302a876baf605184bcf55e73dc55d2e5445564f1937d06805',
    source_maint_table: 'maint_npc_crawler_facts',
    source_maint_record_key: 'c66aeb6db49b290a51a0a4b2ddf88c5b5225e2bfb5e5ae7d61e9fda55fcbc888',
    npc_internal_name: 'UndeadMiner',
    item_internal_name: 'MiningHelmet',
    quantity_text: '1',
    chance_text: '5%',
    status: 1,
    deleted: 0,
  },
  survivor: {
    id: 609,
    record_key: '9908be26efdacd7beb5b0bfbf0f12ba5c09b6c2241d4eec8ef4b698558f5ea54',
    source_fact_key: '4ff1fb336d528624766dd8fbdb62c422afec7540f36693e25db85677efdc86f4',
    npc_internal_name: 'UndeadMiner',
    item_internal_name: 'MiningHelmet',
    quantity_text: '1',
    chance_text: '5%',
    status: 1,
    deleted: 0,
  },
  projection: {
    id: 44,
    internal_name: 'UndeadMiner',
    loot_items_json: JSON.stringify([{
      relationType: 'loot',
      itemInternalName: 'MiningHelmet',
      itemId: 88,
      quantityText: '1',
      chanceText: '5%',
      sourceFactKey: '4ff1fb336d528624766dd8fbdb62c422afec7540f36693e25db85677efdc86f4',
      relationRecordKey: '9908be26efdacd7beb5b0bfbf0f12ba5c09b6c2241d4eec8ef4b698558f5ea54',
    }]),
  },
});

test('registers a governed duplicate-relation retirement operation', () => {
  assert.equal(CANONICAL_CUTOVER_OPERATION_IDS.includes(DUPLICATE_RELATION_RETIREMENT_OPERATION_ID), true);
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[DUPLICATE_RELATION_RETIREMENT_OPERATION_ID], 'pipelines/npc-canonical/npc-duplicate-relation-retirement.mjs');
});

test('builds one exact read-only relation retirement proposal', () => {
  const proposal = buildDuplicateRelationRetirementProposal({ ...TARGET, generatedAt: '2026-08-25T04:10:00.000Z' });
  assert.equal(proposal.operationId, DUPLICATE_RELATION_RETIREMENT_OPERATION_ID);
  assert.equal(proposal.applyAllowed, false);
  assert.equal(proposal.databaseWrites, false);
  assert.deepEqual(proposal.counts, { relationRetirements: 1, projectionChanges: 0, changedPhysicalRows: 1 });
  assert.deepEqual(proposal.writeTargets, ['relation.item_npc_loot_relations.status_deleted']);
  assert.equal(proposal.target.relationId, 1551);
  assert.equal(proposal.survivor.relationId, 609);
});

test('rejects any target or survivor fingerprint drift', () => {
  assert.throws(() => buildDuplicateRelationRetirementProposal({
    ...TARGET,
    generatedAt: '2026-08-25T04:10:00.000Z',
    relation: { ...TARGET.relation, chance_text: '6%' },
  }), /relation target .*drifted/);
  assert.throws(() => buildDuplicateRelationRetirementProposal({
    ...TARGET,
    generatedAt: '2026-08-25T04:10:00.000Z',
    survivor: { ...TARGET.survivor, id: 610 },
  }), /survivor drifted/);
});
