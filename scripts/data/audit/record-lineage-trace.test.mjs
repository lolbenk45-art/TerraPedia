import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecordLineageTracePlan, parseArgs } from './record-lineage-trace.mjs';

test('parseArgs accepts item lineage lookup arguments', () => {
  assert.deepEqual(
    parseArgs(['--entity=item', '--id=42', '--source-id=6131', '--internal-name=Wood', '--record-key=abc']),
    {
      entity: 'item',
      id: 42,
      sourceId: 6131,
      internalName: 'Wood',
      recordKey: 'abc',
      landingDatabase: 'terria_v1_maint',
      maintDatabase: 'terria_v1_maint',
      relationDatabase: 'terria_v1_relation',
      localDatabase: 'terria_v1_local',
    },
  );
});

test('buildRecordLineageTracePlan builds item stages across local relation maint and landing', () => {
  const plan = buildRecordLineageTracePlan({ entity: 'item', id: 42, sourceId: 6131, internalName: 'Wood' });

  assert.equal(plan.steps.length, 7);
  assert.equal(plan.steps[0].stageId, 'local.item');
  assert.equal(plan.steps[1].stageId, 'relation.projection_item');
  assert.equal(plan.steps.at(-1).stageId, 'landing.current_rows');
  assert.match(plan.steps[2].sql, /item_source_facts/);
  assert.match(plan.steps[4].sql, /maint_item_sources/);
  assert.match(plan.steps[5].sql, /item_acquisition_sources/);
  assert.match(plan.steps[0].sql, /WHERE deleted = 0 AND id = \? OR source_id = \? OR internal_name = \?/);
  assert.deepEqual(plan.steps[0].params, [42, 6131, 'Wood']);
  assert.match(plan.steps[1].sql, /WHERE source_id = \? OR internal_name = \?/);
  assert.deepEqual(plan.steps[1].params, [6131, 'Wood']);
  assert.match(plan.steps[5].sql, /item_id = \? OR source_ref_name = \?/);
  assert.deepEqual(plan.steps[5].params, [42, 'Wood']);
});

test('buildRecordLineageTracePlan builds npc stages across local relation maint and landing', () => {
  const plan = buildRecordLineageTracePlan({ entity: 'npc', id: 17, sourceId: 22, internalName: 'Guide' });

  assert.equal(plan.steps.length, 8);
  assert.equal(plan.steps[0].stageId, 'local.npc');
  assert.equal(plan.steps[1].stageId, 'relation.projection_npc');
  assert.match(plan.steps[2].sql, /item_npc_shop_relations/);
  assert.match(plan.steps[3].sql, /item_npc_loot_relations/);
  assert.match(plan.steps.at(-1).sql, /source_dataset_landings/);
  assert.match(plan.steps[1].sql, /WHERE source_id = \? OR internal_name = \?/);
  assert.deepEqual(plan.steps[1].params, [22, 'Guide']);
  assert.deepEqual(plan.steps[5].params, [17]);
  assert.deepEqual(plan.steps[6].params, [17]);
});
