import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { buildArmorAttributeRelations, buildArmorAttributeEffectRows } from './sync-maint-to-relation.mjs';
import { fixture, at, key, snake } from './armor-secondary-projection.fixture.mjs';
import {
  buildArmorSecondaryProjectionProposal as build,
  validateArmorSecondaryProjectionProposal as validate,
  ARMOR_SECONDARY_PROJECTION_TABLES as tables,
} from './armor-secondary-projection.mjs';

test('secondary proposal binds source relation IDs, never generic array positions', async () => {
  const input = await fixture();
  const proposal = await build(input);
  assert.deepEqual(tables, ['projection_item_armor_attributes', 'projection_equipment_effect_attributes']);
  assert.equal(proposal.operationId, 'canonical-armor-secondary-projection');
  assert.equal(proposal.applyAllowed, false);
  assert.equal(proposal.changedRowCount, 2);
  assert.deepEqual(proposal.insertBindings.map(row => [row.table, row.id, row.sourceId]), [
    [tables[0], 734, 734], [tables[1], 906, 906],
  ]);
  assert.equal(proposal.afterRows[tables[1]][0].owner_id, 256);
  assert.equal(proposal.afterRows[tables[1]][0].value_decimal, 3);
  assert.equal(proposal.afterRows[tables[0]][0].defense_value, 2);
  assert.deepEqual(input.beforeRows[tables[0]], []);
  await validate(proposal);
});

test('secondary proposal preserves unrelated rows and existing IDs, and becomes a no-op', async () => {
  const input = await fixture();
  const first = await build(input);
  input.beforeRows = structuredClone(first.afterRows);
  input.beforeRows[tables[0]][0].id = 8100;
  input.beforeRows[tables[1]][0].id = 9100;
  input.beforeRows[tables[1]][0].created_at = at;
  input.beforeRows[tables[1]][0].updated_at = at;
  const unrelated = { ...input.beforeRows[tables[1]][0], id: 9999,
    relation_record_key: key('foreign'), owner_kind: 'npc', owner_id: 40, source_kind: 'npc_fact' };
  input.beforeRows[tables[1]].push(unrelated);
  const proposal = await build(input);
  assert.equal(proposal.changedRowCount, 0);
  assert.deepEqual(proposal.insertBindings, []);
  assert.deepEqual(proposal.afterRows, input.beforeRows);
});

test('secondary proposal ignores retired historical Armor effect keys', async () => {
  const input = await fixture();
  input.sourceRows.relation_equipment_effect_attributes.push({
    ...input.sourceRows.relation_equipment_effect_attributes[0],
    id: 1906,
    record_key: key('z'),
    status: 0,
    deleted: 1,
  });
  const proposal = await build(input);
  assert.equal(proposal.changedRowCount, 2);
});

test('secondary rederivation preserves already-retired source-bound keys as an exact no-op', async () => {
  const input = await fixture();
  const first = await build(input);
  const oldKey = key('historical-all-class-crit');
  input.sourceRows.relation_equipment_effect_attributes.push({
    ...input.sourceRows.relation_equipment_effect_attributes[0], id: 1906,
    record_key: oldKey, class_scope: 'all', status: 0, deleted: 1,
  });
  input.beforeRows = structuredClone(first.afterRows);
  input.beforeRows[tables[1]].push({
    ...first.afterRows[tables[1]][0], id: 2906, relation_record_key: oldKey,
    class_scope: 'all', created_at: at, updated_at: at,
  });
  const retirement = await build(input);
  assert.equal(retirement.changedRowCount, 1);
  input.beforeRows = structuredClone(retirement.afterRows);
  const next = await build(input);
  assert.equal(next.changedRowCount, 0);
  assert.deepEqual(next.afterRows, retirement.afterRows);
  assert.deepEqual(next.insertBindings, []);
  await validate(next);

  input.sourceRows.relation_equipment_effect_attributes.pop();
  await assert.rejects(build(input), /foreign\/inactive projection/, 'unknown retired keys still fail closed');
});

test('secondary proposal rejects multiple source-proven active attribute rows for one member', async () => {
  const input = await fixture();
  const landing = input.sourceRows.maint_landings[0];
  const payload = JSON.parse(landing.payload_json);
  payload.records.push({ ...payload.records[0], rawCells: { meleeCritChance: '5%' } });
  landing.payload_json = JSON.stringify(payload);
  landing.content_hash = key(payload);
  const { rows } = await extractMaintEntitiesFromLandingRow(landing);
  input.sourceRows.maint_armor_attribute_rows = rows.map((row, i) => ({ ...snake(row), id: 34 + i, status: 1, deleted: 0 }));
  const attributes = buildArmorAttributeRelations({
    maintArmorAttributeRows: input.sourceRows.maint_armor_attribute_rows, maintItems: input.sourceRows.maint_items,
  });
  input.sourceRows.relation_armor_attribute_rows = attributes.map((row, i) => ({ ...snake(row), id: 734 + i, status: 1, deleted: 0 }));
  input.sourceRows.relation_equipment_effect_attributes = buildArmorAttributeEffectRows(attributes)
    .map((row, i) => ({ ...snake(row), id: 906 + i, status: 1, deleted: 0 }));
  await assert.rejects(build(input), /attribute member.*duplicate|attribute member.*ambiguous/);
});

test('secondary update preserves existing identity and timestamps while repairing only owned fields', async () => {
  const input = await fixture();
  input.beforeRows = (await build(input)).afterRows;
  input.beforeRows[tables[1]][0] = { ...input.beforeRows[tables[1]][0], id: 777,
    value_decimal: 99, created_at: at, updated_at: at };
  const proposal = await build(input);
  assert.equal(proposal.changedRowCount, 1);
  assert.equal(proposal.updates[tables[1]][0].id, 777);
  assert.equal(proposal.updates[tables[1]][0].value_decimal, 3);
  assert.equal(proposal.updates[tables[1]][0].updated_at, at);
});

const rejections = [
  ['contradictory member name', input => { input.sourceRows.relation_armor_set_items[0].item_internal_name = 'Foreign'; }],
  ['contradictory local name', input => { input.sourceRows.local_items[0].internal_name = 'Foreign'; }],
  ['member not in source variant', input => { input.sourceRows.relation_armor_sets[0].sets_json = '[[999,0,0]]'; }],
  ['missing member attribute', input => { input.sourceRows.relation_armor_attribute_rows = []; }],
  ['unaccepted relation attribute', input => { input.sourceRows.relation_armor_attribute_rows[0].review_status = 'unresolved'; }],
  ['stale source defense', input => { input.sourceRows.relation_armor_attribute_rows[0].defense_value = 99; }],
  ['broken maint lineage', input => { input.sourceRows.relation_armor_attribute_rows[0].source_maint_id = 99; }],
  ['changed maint cells', input => { input.sourceRows.maint_armor_attribute_rows[0].raw_cells_json = '{}'; }],
  ['missing landing', input => { input.sourceRows.maint_landings = []; }],
  ['landing payload drift', input => { input.sourceRows.maint_landings[0].payload_json = '{}'; }],
  ['missing source effect', input => { input.sourceRows.relation_equipment_effect_attributes = []; }],
  ['stale source effect', input => { input.sourceRows.relation_equipment_effect_attributes[0].value_decimal = '99.0000'; }],
  ['foreign effect owner key', input => { input.sourceRows.relation_equipment_effect_attributes[0].owner_key = 'Foreign'; }],
  ['wrong effect source kind', input => { input.sourceRows.relation_equipment_effect_attributes[0].source_kind = 'benefit_zh'; }],
  ['inactive effect', input => { input.sourceRows.relation_equipment_effect_attributes[0].deleted = 1; }],
  ['duplicate source key', input => { input.sourceRows.relation_armor_attribute_rows.push({ ...input.sourceRows.relation_armor_attribute_rows[0], id: 735 }); }],
  ['ambiguous name lookup', input => { input.sourceRows.maint_items.push({ ...input.sourceRows.maint_items[0], id: 52, source_id: 999, internal_name: 'Foreign' }); }],
];
for (const [name, change] of rejections) {
  test(`secondary proposal rejects ${name}`, async () => {
    const input = await fixture();
    change(input);
    await assert.rejects(build(input), /Armor secondary/);
  });
}

test('secondary proposal rejects an inserted ID collision with unrelated data', async () => {
  const input = await fixture();
  input.beforeRows[tables[1]] = [{ ...(await build(input)).afterRows[tables[1]][0],
    owner_kind: 'npc', owner_id: 9, relation_record_key: key('foreign') }];
  await assert.rejects(build(input), /collision/);
});

test('secondary proposal rejects foreign or inactive projections consumed under a member identity', async () => {
  for (const mutate of [row => { row.relation_record_key = key('foreign'); }, row => { row.deleted = 1; },
    row => { row.owner_id = 99; }, row => { row.source_kind = 'benefit_zh'; }]) {
    const input = await fixture();
    input.beforeRows = (await build(input)).afterRows;
    mutate(input.beforeRows[tables[1]][0]);
    await assert.rejects(build(input), /Armor secondary/);
  }
});

test('zero-effect members remain valid only with source-proven zero cells', async () => {
  const input = await fixture();
  const landing = input.sourceRows.maint_landings[0];
  const payload = JSON.parse(landing.payload_json);
  payload.records[0].rawCells = { meleeCritChance: '0%' };
  landing.payload_json = JSON.stringify(payload); landing.content_hash = key(payload);
  const { rows } = await extractMaintEntitiesFromLandingRow(landing);
  const maint = { ...snake(rows[0]), id: 34, status: 1, deleted: 0 };
  input.sourceRows.maint_armor_attribute_rows = [maint];
  input.sourceRows.relation_armor_attribute_rows = buildArmorAttributeRelations({
    maintArmorAttributeRows: [maint], maintItems: input.sourceRows.maint_items
  }).map(row => ({ ...snake(row), id: 734, status: 1, deleted: 0 }));
  input.sourceRows.relation_equipment_effect_attributes = [];
  const proposal = await build(input);
  assert.equal(proposal.changedRowCount, 1);
  assert.deepEqual(proposal.afterRows[tables[1]], []);
});

test('secondary validator rederives fields and rejects a rehashed forged after-set', async () => {
  const proposal = await build(await fixture());
  proposal.afterRows[tables[1]][0].value_decimal = 999;
  // No supplied hash alone may establish authority for the altered values.
  const { proposalSha256, ...body } = proposal;
  proposal.proposalSha256 = `sha256:${key(body)}`;
  await assert.rejects(validate(proposal), /Armor secondary/);
});

test('an explicitly frozen member subset preserves excluded members and cannot claim complete coverage', async () => {
  const input = await fixture();
  input.sourceRows.relation_armor_sets[0].sets_json = '[[256,257,0]]';
  input.sourceRows.relation_armor_set_items.push({ ...input.sourceRows.relation_armor_set_items[0],
    id: 62, record_key: key('body'), part_index: 1, item_source_id: 257, item_internal_name: 'NinjaShirt' });
  input.sourceRows.maint_items.push({ ...input.sourceRows.maint_items[0], id: 52, source_id: 257,
    internal_name: 'NinjaShirt', name_zh: '忍者衣', english_name: 'Ninja Shirt' });
  input.sourceRows.local_items.push({ id: 257, internal_name: 'NinjaShirt', status: 1, deleted: 0 });
  await assert.rejects(build(input), /member attribute is missing/);
  const proposal = await build({ ...input, selectedMemberIds: [256] });
  assert.equal(proposal.changedRowCount, 2);
  assert.deepEqual(proposal.coverage, { totalMembers: 2, selectedMembers: 1, excludedMemberIds: [257], complete: false });
  assert.deepEqual(proposal.selectedMemberIds, [256]);
  await validate(proposal);
});

for (const selectedMemberIds of [[], [256, 256], [999], ['256']]) {
  test(`secondary rejects invalid explicit member scope ${JSON.stringify(selectedMemberIds)}`, async () => {
    await assert.rejects(build({ ...await fixture(), selectedMemberIds }), /Armor secondary/);
  });
}

test('secondary rejects incomplete or unknown target columns before deriving updates', async () => {
  for (const change of [row => { delete row.confidence; }, row => { row.unowned_column = 'new'; }]) {
    const input = await fixture();
    input.beforeRows = (await build(input)).afterRows;
    change(input.beforeRows[tables[1]][0]);
    await assert.rejects(build(input), /columns/);
  }
});
