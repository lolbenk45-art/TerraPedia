import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildArmorCanonicalMaintCandidate } from '../maint/armor-canonical-maint-candidate.mjs';
import { buildArmorCanonicalRelationCandidate } from './armor-canonical-relation-candidate.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import { parseEquipmentEffectLines } from './equipment-effect-parser.mjs';
import { buildArmorAttributeEffectRows } from './sync-maint-to-relation.mjs';
import {
  buildArmorCanonicalProjectionCandidate as build,
  buildArmorCanonicalProjectionIdIndependentCandidate,
} from './armor-canonical-projection-candidate.mjs';
import { buildArmorCanonicalIntent, materializeArmorCanonicalIntent } from './armor-canonical-intent.mjs';
const prefix = 'https://media.example.test/terrapedia-images/items/';
const at = '2026-09-24T01:00:00.000Z';
const revision = '2026-09-23T23:00:00.000Z';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = value => digest(value);
const snake = row => Object.fromEntries(Object.entries(row).map(([name, value]) => [name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));
const camel = row => Object.fromEntries(Object.entries(row).map(([name, value]) => [name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
const relationTables = ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'];
const dependencyTables = ['relation_items', 'relation_item_images', 'relation_armor_attribute_rows', 'relation_equipment_effect_attributes'];
const consumerTables = ['items', 'item_images', 'projection_item_armor_attributes', 'projection_equipment_effect_attributes'];

function sourceFixture() {
  const armor = {
    source: 'terraria.wiki.gg:Module:ArmorSetBonuses', sourcePageTitle: 'Module:ArmorSetBonuses',
    sourceRevisionTimestamp: revision, fetchedAt: at, totalArmorSets: 1,
    armorSets: [{ textKey: 'ArmorSetBonus.Wood', benefitExpression: 'WoodBonus', effectText: '+9% 暴击率',
      primaryPart: null, setCount: 1, sets: [[1, 2, 3]], uniqueItemIds: [1, 2, 3] }],
  };
  const images = {
    sourcePageTitle: 'Armor set pages', fetchedAt: at, totalArmorSetImages: 1, warnings: [],
    armorSetImages: [{ textKey: 'ArmorSetBonus.Wood', pageTitle: 'Wood armor', imageRole: 'male',
      sourceFileTitle: 'Wood_armor.png', originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
      cachedUrl: `${prefix}Wood_armor.png`, sourceRevisionTimestamp: revision,
      isPrimary: true, sortOrder: 0, width: 40, height: 50, contentType: 'image/png' }],
  };
  const landing = (id, dataset, sourceKey, payload) => ({
    id, dataset_type: dataset, source_key: sourceKey, provider: 'terraria.wiki.gg',
    source_page: payload.sourcePageTitle, source_revision_timestamp: payload.sourceRevisionTimestamp ?? null,
    fetched_at: at, parsed_at: at, payload_json: JSON.stringify(payload), content_hash: digest(payload),
    artifact_role: 'source_evidence', parse_status: 'ok', is_current: 1,
  });
  return {
    relationInput: {
      maintInput: {
        landingRows: [landing(31, 'armor_sets_raw', 'wiki.module.armorsetbonuses', armor),
          landing(32, 'armor_set_images_raw', 'wiki.armor_set_images', images)],
        currentRows: { maint_armor_sets: [], maint_armor_set_images: [] }, managedImageUrlPrefixes: [prefix],
      },
      maintItems: ['WoodHelmet', 'WoodBreastplate', 'WoodGreaves'].map((name, index) => ({
        id: 10 + index, source_id: index + 1, internal_name: name, english_name: name, defense_value: 2,
        raw_json: JSON.stringify({ [['headSlot', 'bodySlot', 'legSlot'][index]]: 1, defense: 2 }),
        source_provider: 'terraria.wiki.gg', landing_source_id: 30, landing_source_key: 'wiki.module.iteminfo',
        landing_content_hash: 'a'.repeat(64), status: 1, deleted: 0,
      })),
      currentRows: Object.fromEntries(relationTables.map(table => [table, []])),
    },
    currentRows: { projection_armor_sets: [] },
    dependencyRows: Object.fromEntries(dependencyTables.map(table => [table, []])),
    consumerRows: Object.fromEntries(consumerTables.map(table => [table, []])),
    managedImageUrlPrefixes: [prefix],
  };
}

function changePayload(input, index, mutate) {
  const landing = input.relationInput.maintInput.landingRows[index];
  const payload = typeof landing.payload_json === 'string' ? JSON.parse(landing.payload_json) : landing.payload_json;
  mutate(payload);
  landing.payload_json = JSON.stringify(payload);
  landing.content_hash = digest(payload);
}

async function fixture({ existing = true } = {}) {
  const input = sourceFixture();
  if (existing) {
    const maint = await buildArmorCanonicalMaintCandidate(input.relationInput.maintInput);
    input.relationInput.maintInput.currentRows = structuredClone(maint.expectedRows);
    for (const rows of Object.values(input.relationInput.maintInput.currentRows)) rows.forEach((row, index) => { row.id = 50 + index; });
    const relation = await buildArmorCanonicalRelationCandidate(input.relationInput);
    input.relationInput.currentRows = structuredClone(relation.expectedRows);
    for (const rows of Object.values(input.relationInput.currentRows)) rows.forEach((row, index) => { row.id = 100 + index; });
  }
  const relation = await buildArmorCanonicalRelationCandidate(input.relationInput);
  const owner = relation.expectedRows.relation_armor_sets[0];
  input.dependencyRows.relation_items = input.relationInput.maintItems.map(row => ({
    ...row, id: row.id + 100, record_key: key(row.internal_name), source_maint_table: 'maint_items', source_maint_id: row.id,
  }));
  input.dependencyRows.relation_item_images = input.relationInput.maintItems.map((row, index) => ({
    id: index + 20, record_key: key(`image:${row.internal_name}`), item_internal_name: row.internal_name,
    cached_url: `${prefix}${row.internal_name}.png`, is_primary: 1, sort_order: 0, status: 1, deleted: 0,
  }));
  input.dependencyRows.relation_armor_attribute_rows = input.relationInput.maintItems.map((row, index) => ({
    id: index + 30, record_key: key(`armor:${row.internal_name}`), item_id: row.source_id,
    item_internal_name: row.internal_name, defense_value: 2, source_maint_table: 'maint_armor_attribute_rows',
    source_provider: 'terraria.wiki.gg', source_page: 'Armor', source_revision_timestamp: revision,
    raw_cells_json: '{}', status: 1, deleted: 0,
  }));
  input.dependencyRows.relation_equipment_effect_attributes = parseEquipmentEffectLines({
    owner: { ownerKind: 'armor_set', ownerRecordKey: owner.record_key, ownerKey: owner.text_key, ownerId: owner.id ?? null,
      sourceProvider: owner.source_provider, sourcePage: owner.source_page, sourceRevisionTimestamp: owner.source_revision_timestamp },
    text: '+9% 暴击率',
  }).map((row, index) => ({ ...snake(row), id: index + 40, record_key: key(`effect:${index}`), confidence: 0.9 }));
  const projected = buildProjectionPayload(Object.fromEntries([
    ...Object.entries({ ...relation.expectedRows, ...input.dependencyRows }).map(([table, rows]) => [Object.keys(camel({ [table]: null }))[0], rows.map(camel)]),
    ['managedImageUrlPrefixes', [prefix]],
  ]));
  if (existing) input.currentRows.projection_armor_sets = projected.projectionArmorSets.map(row => ({ ...snake(row), id: 900 }));
  input.consumerRows.items = input.relationInput.maintItems.map(row => ({ id: row.source_id, internal_name: row.internal_name, defense: 2, status: 1, deleted: 0 }));
  input.consumerRows.item_images = input.dependencyRows.relation_item_images.map((row, index) => ({
    id: row.id, item_id: index + 1, cached_url: row.cached_url, is_primary: 1, sort_order: 0, status: 1, deleted: 0,
  }));
  input.consumerRows.projection_item_armor_attributes = projected.projectionItemArmorAttributes.map(snake);
  input.consumerRows.projection_equipment_effect_attributes = projected.projectionEquipmentEffectAttributes.map(row => ({ ...snake(row), owner_id: 900 }));
  return input;
}

test('composes the reviewed relation builder and preserves actual projection IDs in read-only dependencies', async () => {
  assert.equal(typeof build, 'function', 'the pure projection candidate builder is required');
  const input = await fixture();
  const result = await build(input);
  assert.equal(result.schemaVersion, 'armor-canonical-projection-candidate/v1');
  assert.equal(result.executable, false);
  assert.deepEqual(result.tables, ['projection_armor_sets']);
  assert.deepEqual(result.deletes, []);
  assert.equal(result.expectedRows.projection_armor_sets[0].id, 900);
  assert.equal(result.relationCandidate.expectedRows.relation_armor_sets[0].id, 100);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.acceptance.status, 'dependencies-satisfied');
  assert.equal(result.acceptance.runtimeVerified, false);
  assert.deepEqual(result.acceptance.blockers, []);
  assert.deepEqual(result.dependencyExpectations.projection_equipment_effect_attributes,
    input.consumerRows.projection_equipment_effect_attributes.map(({ id, created_at, updated_at, ...row }) => row));
});

test('binds a typed intent to the real projection candidate hash graph and existing relation ID', async () => {
  const input = await fixture();
  input.currentRows.projection_armor_sets = [];
  input.consumerRows.projection_equipment_effect_attributes.forEach(effect => { effect.owner_id = 100; });
  const candidate = await build(input);
  const row = candidate.changes.projection_armor_sets.inserts[0];
  const { id: _ignoredId, created_at: _ignoredCreated, updated_at: _ignoredUpdated, ...nonGeneratedFields } = row;
  const plan = {
    databaseRole: 'relation', table: 'projection_armor_sets', logicalKey: row.text_key,
    primaryKeyColumn: 'id', generatedColumns: ['created_at', 'updated_at'], nonGeneratedFields,
    references: [{ column: 'id', target: `relation.relation_armor_sets|${row.relation_record_key}` }],
  };
  const intent = buildArmorCanonicalIntent({ candidate, insertPlans: [plan], writeTimestamp: '2026-09-24T04:10:00Z' });
  assert.equal(intent.sourceSnapshotSha256, candidate.relationCandidate.sourceSnapshotSha256);
  assert.equal(intent.relationInputSha256, candidate.relationCandidate.inputSha256);
  const readback = { ...nonGeneratedFields, id: row.id, created_at: '2026-09-24T04:10:00Z', updated_at: '2026-09-24T04:10:00Z' };
  const materialized = materializeArmorCanonicalIntent({ intent, receipts: [{
    databaseRole: 'relation', table: 'projection_armor_sets', logicalKey: row.text_key,
    insertId: row.id, affectedRows: 1, readback,
  }] });
  assert.equal(materialized.concreteInsertPlans[0].nonGeneratedFields.id, row.id);
});

test('new rows expose unresolved projection and upstream lineage slots instead of the generic hash ID', async () => {
  const input = await fixture({ existing: false });
  const result = await build(input);
  const row = result.changes.projection_armor_sets.inserts[0];
  assert.equal(Object.hasOwn(row, 'id'), false);
  assert.deepEqual(result.unresolvedGeneratedIds, [{ table: 'projection_armor_sets', textKey: row.text_key,
    column: 'id', referencedTable: 'relation_armor_sets', recordKey: row.relation_record_key }]);
  assert.equal(result.unresolvedDependencies.length, 3);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'generated-identities-unresolved'));
  assert.equal(result.dependencyExpectations.projection_equipment_effect_attributes[0].owner_id, null);
  assert.ok(result.unresolvedDependencies.some(row => row.table === 'projection_equipment_effect_attributes' && row.column === 'owner_id'));
});

test('explicit ID-independent projection mode preserves unresolved landing and maint identities for one transaction', async () => {
  const input = await fixture({ existing: false });
  for (const row of input.relationInput.maintInput.landingRows) delete row.id;
  input.relationInput.maintInput.allowUnmaterializedLandingIds = true;
  const result = await buildArmorCanonicalProjectionIdIndependentCandidate(input);
  assert.equal(result.relationCandidate.inputSnapshots.maintInput.allowUnmaterializedLandingIds, true);
  assert.equal(result.relationCandidate.expectedRows.relation_armor_sets[0].source_maint_id, null);
  assert.ok(result.relationCandidate.unresolvedDependencies.some(row => row.column === 'source_maint_id'));
});

test('new projection over an existing relation uses that actual relation ID', async () => {
  const input = await fixture();
  input.currentRows.projection_armor_sets = [];
  const result = await build(input);
  assert.equal(result.expectedRows.projection_armor_sets[0].id, 100);
  assert.deepEqual(result.unresolvedGeneratedIds, []);
});

test('canonical source changes preserve historical IDs and unmatched rows and flag removals', async () => {
  const input = await fixture();
  const original = structuredClone(input.currentRows.projection_armor_sets[0]);
  changePayload(input, 0, payload => { payload.armorSets[0].textKey = 'ArmorSetBonus.New'; });
  changePayload(input, 1, payload => { payload.armorSetImages[0].textKey = 'ArmorSetBonus.New'; });
  const result = await build(input);
  assert.equal(result.summary.preserved, 1);
  assert.deepEqual(result.changes.projection_armor_sets.preserved, [original]);
  assert.equal(result.expectedRows.projection_armor_sets.length, 2);
  assert.equal(result.requiresRemovalReview, true);
  assert.deepEqual(result.removedIdentities, { projection_armor_sets: ['ArmorSetBonus.Wood'] });
  assert.ok(result.acceptance.blockers.some(row => row.code === 'source-removal-review-required'));
  assert.deepEqual(result.deletes, []);
});

test('detaches freezes and hashes every selected SQL row without caller mutation or landing key reordering', async () => {
  const input = await fixture();
  for (const row of input.relationInput.maintInput.landingRows) row.payload_json = JSON.parse(row.payload_json);
  const original = structuredClone(input);
  const pending = build(input);
  input.consumerRows.items[0].defense = 900;
  input.dependencyRows.relation_items[0].name_zh = 'changed during await';
  const result = await pending;
  assert.deepEqual(result.inputSnapshots, original);
  assert.ok(Object.isFrozen(result.inputSnapshots.consumerRows.items[0]));
  assert.ok(Object.isFrozen(result.expectedRows.projection_armor_sets[0]));
  assert.ok(Object.isFrozen(result.dependencyExpectations.projection_equipment_effect_attributes[0]));
  for (const field of ['inputSha256', 'baselineSha256', 'dependencySnapshotSha256', 'consumerSnapshotSha256', 'managedImagePolicySha256', 'candidateSha256']) {
    assert.match(result[field], /^sha256:[a-f0-9]{64}$/);
  }
  const changed = structuredClone(original);
  changed.consumerRows.items[0].description = 'unused but exact frozen column';
  const next = await build(changed);
  assert.notEqual(next.consumerSnapshotSha256, result.consumerSnapshotSha256);
  assert.notEqual(next.candidateSha256, result.candidateSha256);
});

for (const section of ['currentRows', 'dependencyRows', 'consumerRows']) {
  test(`requires exact ${section} table snapshots`, async () => {
    const input = await fixture();
    delete input[section][Object.keys(input[section])[0]];
    await assert.rejects(build(input), /exact|complete/);
  });
}

for (const extra of ['candidate', 'relationCandidate', 'candidateSha256', 'executable']) {
  test(`rejects caller ${extra} authority`, async () => {
    const input = await fixture();
    input[extra] = true;
    await assert.rejects(build(input), /exact/);
  });
}

for (const [label, mutate, pattern] of [
  ['runtime policy drift', input => input.managedImageUrlPrefixes.push('https://foreign.test/'), /prefix|policy/],
  ['duplicate projection ID', input => input.currentRows.projection_armor_sets.push({ ...input.currentRows.projection_armor_sets[0], text_key: 'Other', relation_record_key: key('Other') }), /duplicate|identity/],
  ['projection rekey', input => { input.currentRows.projection_armor_sets[0].relation_record_key = key('wrong'); }, /identity|key/],
  ['projection source key drift', input => { input.currentRows.projection_armor_sets[0].source_key = 'Wrong'; }, /identity|key/],
  ['inactive projection reactivation', input => { input.currentRows.projection_armor_sets[0].status = 0; }, /inactive|reactivat/],
  ['duplicate item source', input => input.dependencyRows.relation_items.push({ ...input.dependencyRows.relation_items[0], id: 999, record_key: key('duplicate') }), /duplicate|ambiguous/],
  ['conflicting item name', input => { input.dependencyRows.relation_items[0].internal_name = 'Wrong'; }, /item.*identity|item.*join/],
  ['wrong item maint identity', input => { input.dependencyRows.relation_items[0].source_maint_id = 999; }, /item.*lineage|item.*join/],
  ['duplicate effect key', input => input.dependencyRows.relation_equipment_effect_attributes.push({ ...input.dependencyRows.relation_equipment_effect_attributes[0], id: 999 }), /duplicate/],
  ['ambiguous SQL aliases', input => { input.dependencyRows.relation_items[0].sourceId = 1; }, /SQL|column/],
  ['invalid calendar date', input => { input.consumerRows.items[0].updated_at = '2026-02-30T00:00:00Z'; }, /calendar|timestamp/],
  ['undefined snapshot field', input => { input.consumerRows.items[0].description = undefined; }, /JSON|snapshot/],
]) {
  test(`rejects ${label}`, async () => {
    const input = await fixture();
    mutate(input);
    await assert.rejects(build(input), pattern);
  });
}

for (const image of ['https://foreign.test/a.png', `${prefix}../x.png`, `${prefix}%2e%2e/x.png`,
  `${prefix}%252e%252e/x.png`, `${prefix}x%2f.png`, `${prefix}x.png?x=1`, '/terrapedia-images/items/../x.png']) {
  test(`rejects unsafe dependency media ${image}`, async () => {
    const input = await fixture();
    input.dependencyRows.relation_item_images[0].cached_url = image;
    await assert.rejects(build(input), /image|media/);
  });
}

for (const [label, mutate, code] of [
  ['missing relation item', input => input.dependencyRows.relation_items.shift(), 'relation-item-missing'],
  ['stale relation item defense', input => { input.dependencyRows.relation_items[0].defense_value = 99; }, 'relation-item-stale'],
  ['missing part image', input => { input.dependencyRows.relation_item_images[0].cached_url = null; }, 'part-image-missing'],
  ['foreign image owner', input => { input.dependencyRows.relation_item_images[0].item_internal_name = 'Wrong'; }, 'item-image-owner-foreign'],
  ['missing local defense', input => { input.consumerRows.items[0].defense = null; }, 'defense-fallback-only'],
  ['stale preferred local defense', input => { input.consumerRows.items[0].defense = 99; }, 'local-defense-stale'],
  ['foreign local item name', input => { input.consumerRows.items[0].internal_name = 'Wrong'; }, 'local-item-identity-mismatch'],
  ['missing projected defense row', input => input.consumerRows.projection_item_armor_attributes.shift(), 'armor-attribute-projection-missing'],
  ['stale projected defense row', input => { input.consumerRows.projection_item_armor_attributes[0].defense_value = 99; }, 'armor-attribute-projection-stale'],
  ['foreign attribute item source', input => { input.dependencyRows.relation_armor_attribute_rows[0].item_internal_name = 'Wrong'; }, 'armor-attribute-owner-foreign'],
  ['missing source effects', input => { input.dependencyRows.relation_equipment_effect_attributes = []; }, 'source-effect-missing'],
  ['missing consumer effects', input => { input.consumerRows.projection_equipment_effect_attributes = []; }, 'effect-projection-missing'],
  ['stale consumer effects', input => { input.consumerRows.projection_equipment_effect_attributes[0].value_decimal = 99; }, 'effect-projection-stale'],
  ['wrong consumer effect owner ID', input => { input.consumerRows.projection_equipment_effect_attributes[0].owner_id = 100; }, 'effect-projection-stale'],
  ['foreign effect on actual owner ID', input => { input.consumerRows.projection_equipment_effect_attributes[0].relation_record_key = key('foreign'); }, 'effect-projection-foreign'],
  ['foreign relation effect owner key', input => { input.dependencyRows.relation_equipment_effect_attributes[0].owner_key = 'Other'; }, 'source-effect-owner-foreign'],
  ['foreign relation effect parent key', input => { input.dependencyRows.relation_equipment_effect_attributes[0].owner_record_key = key('Other'); }, 'source-effect-owner-foreign'],
  ['stale relation effect source revision', input => { input.dependencyRows.relation_equipment_effect_attributes[0].source_revision_timestamp = '2026-09-22T01:00:00Z'; }, 'source-effect-stale'],
  ['stale relation effect semantic value', input => { input.dependencyRows.relation_equipment_effect_attributes[0].value_decimal = 99; }, 'source-effect-stale'],
  ['stale source effect text', input => { input.dependencyRows.relation_equipment_effect_attributes[0].source_line = '+8% 暴击率'; }, 'source-effect-stale'],
  ['symbolic benefit lacks effect text evidence', input => changePayload(input, 0, payload => { delete payload.armorSets[0].effectText; }), 'source-effect-evidence-unresolved'],
]) {
  test(`blocks acceptance for ${label} without dependency writes`, async () => {
    const input = await fixture();
    mutate(input);
    const exact = structuredClone(input);
    const result = await build(input);
    assert.equal(result.acceptance.status, 'blocked');
    assert.ok(result.acceptance.blockers.some(row => row.code === code), JSON.stringify(result.acceptance.blockers));
    assert.deepEqual(result.tables, ['projection_armor_sets']);
    assert.deepEqual(result.inputSnapshots, exact);
    assert.deepEqual(input, exact);
  });
}

test('a missing derived part image retains the existing image and reports the missing dependency', async () => {
  const input = await fixture();
  const beforeParts = JSON.parse(input.currentRows.projection_armor_sets[0].related_items_json);
  input.dependencyRows.relation_item_images[0].cached_url = null;
  const result = await build(input);
  const afterParts = JSON.parse(result.expectedRows.projection_armor_sets[0].related_items_json);
  assert.equal(afterParts[0].image, beforeParts[0].image);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'part-image-missing'));
});

test('source image removal retains the old projection image and requires explicit removal review', async () => {
  const input = await fixture();
  changePayload(input, 1, payload => { payload.armorSetImages = []; payload.totalArmorSetImages = 0; });
  const result = await build(input);
  assert.equal(result.expectedRows.projection_armor_sets[0].male_images, `${prefix}Wood_armor.png`);
  assert.equal(result.requiresRemovalReview, true);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-image-removal-review-required'));
});

test('a new armor with only local item-image fallback stays blocked', async () => {
  const input = await fixture({ existing: false });
  changePayload(input, 1, payload => { payload.armorSetImages = []; payload.totalArmorSetImages = 0; });
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-image-fallback-only'));
  assert.equal(result.expectedRows.projection_armor_sets[0].male_images, null);
});

test('missing source effects are not fabricated into read-only expectations', async () => {
  const input = await fixture();
  input.dependencyRows.relation_equipment_effect_attributes = [];
  const result = await build(input);
  assert.deepEqual(result.dependencyExpectations.projection_equipment_effect_attributes, []);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'source-effect-missing'));
});

test('all source effect fragments must be present even when one valid effect remains', async () => {
  const input = await fixture();
  changePayload(input, 0, payload => { payload.armorSets[0].effectText += '\n+1 仆从容量'; });
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'source-effect-missing'));
});

test('an unrelated inactive projection row and unrelated local item are preserved and bound', async () => {
  const input = await fixture();
  const extra = { ...input.currentRows.projection_armor_sets[0], id: 901, relation_record_key: key('Retired'),
    text_key: 'ArmorSetBonus.Retired', source_key: 'ArmorSetBonus.Retired', status: 0 };
  input.currentRows.projection_armor_sets.push(extra);
  input.consumerRows.items.push({ id: 888, internal_name: 'Unrelated', defense: 999, status: 0, deleted: 0 });
  const result = await build(input);
  assert.deepEqual(result.changes.projection_armor_sets.preserved, [extra]);
  assert.equal(result.requiresRemovalReview, false);
  assert.deepEqual(result.acceptance.blockers, []);
  assert.equal(result.inputSnapshots.consumerRows.items.length, 4);
});

for (const [label, mutate] of [
  ['part source alias', part => { part.sourceId = 999; }],
  ['part item alias', part => { part.id = 999; }],
  ['part name', part => { part.internalName = 'Wrong'; }],
  ['part slot', part => { part.partIndex = 2; }],
]) {
  test(`rejects ambiguous baseline ${label}`, async () => {
    const input = await fixture();
    const row = input.currentRows.projection_armor_sets[0];
    const parts = JSON.parse(row.related_items_json);
    mutate(parts[0]);
    row.related_items_json = JSON.stringify(parts);
    await assert.rejects(build(input), /part|identity|slot/);
  });
}

test('SQL numeric effect values and Date trace columns compare without invented drift', async () => {
  const input = await fixture();
  input.consumerRows.projection_equipment_effect_attributes[0].value_decimal = '9.0000';
  input.consumerRows.projection_equipment_effect_attributes[0].confidence = '0.9000';
  input.dependencyRows.relation_items[0].module_generated_at = '2026-09-24 01:00:00 by wiki';
  input.consumerRows.projection_item_armor_attributes[0].source_revision_timestamp = new Date(revision);
  const result = await build(input);
  assert.deepEqual(result.acceptance.blockers, []);
  assert.equal(result.inputSnapshots.consumerRows.projection_item_armor_attributes[0].source_revision_timestamp, revision);
});

test('new relation-backed projection IDs may not collide with an unmatched historical projection', async () => {
  const input = await fixture();
  input.currentRows.projection_armor_sets[0] = { ...input.currentRows.projection_armor_sets[0], id: 100,
    text_key: 'ArmorSetBonus.Historical', source_key: 'ArmorSetBonus.Historical', relation_record_key: key('Historical') };
  await assert.rejects(build(input), /projection.*ID.*collid|projection.*identity/);
});

test('duplicate local item names cannot alias different source IDs', async () => {
  const input = await fixture();
  input.consumerRows.items.push({ ...input.consumerRows.items[0], id: 999 });
  await assert.rejects(build(input), /local.*item.*duplicate|local.*item.*ambiguous/);
});

test('all concrete projection columns are required, including nullable timestamps', async () => {
  const input = await fixture();
  delete input.currentRows.projection_armor_sets[0].created_at;
  await assert.rejects(build(input), /complete.*projection|projection.*complete/);
});

test('snake-case aliases inside related-item JSON cannot shadow its canonical identity', async () => {
  const input = await fixture();
  const row = input.currentRows.projection_armor_sets[0];
  const parts = JSON.parse(row.related_items_json);
  parts[0].item_id = 999;
  row.related_items_json = JSON.stringify(parts);
  await assert.rejects(build(input), /part.*alias|part.*identity/);
});

test('normalized equal source and runtime policies are accepted without losing exact inputs', async () => {
  const input = await fixture();
  input.managedImageUrlPrefixes = [prefix.slice(0, -1)];
  const result = await build(input);
  assert.deepEqual(result.acceptance.blockers, []);
  assert.deepEqual(result.managedImageUrlPrefixes, [prefix]);
  assert.deepEqual(result.inputSnapshots.managedImageUrlPrefixes, [prefix.slice(0, -1)]);
});

test('a second canonical module entity is derived without a historical hard-coded count', async () => {
  const input = await fixture();
  changePayload(input, 0, payload => {
    payload.armorSets.push({ ...payload.armorSets[0], textKey: 'ArmorSetBonus.Second' });
    payload.totalArmorSets = 2;
  });
  const result = await build(input);
  assert.equal(result.summary.inserts, 1);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.expectedRows.projection_armor_sets.length, 2);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'source-effect-missing' && row.textKey === 'ArmorSetBonus.Second'));
});

test('matching but unparsed source effect text remains an unresolved semantic dependency', async () => {
  const input = await fixture();
  changePayload(input, 0, payload => { payload.armorSets[0].effectText = 'Unrecognized effect expression'; });
  const owner = input.relationInput.currentRows.relation_armor_sets[0];
  input.dependencyRows.relation_equipment_effect_attributes = parseEquipmentEffectLines({
    owner: { ownerKind: 'armor_set', ownerRecordKey: owner.record_key, ownerKey: owner.text_key, ownerId: owner.id,
      sourceProvider: owner.source_provider, sourcePage: owner.source_page, sourceRevisionTimestamp: owner.source_revision_timestamp },
    text: 'Unrecognized effect expression',
  }).map((row, index) => ({ ...snake(row), id: index + 40, record_key: key(`effect:${index}`) }));
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'source-effect-parse-unresolved'));
});

test('optional item-owner effects are frozen separately and cannot be adopted as armor-owner effects', async () => {
  const input = await fixture();
  input.consumerRows.projection_equipment_effect_attributes.push({
    ...input.consumerRows.projection_equipment_effect_attributes[0], id: 99,
    relation_record_key: key('piece-effect'), owner_kind: 'item', owner_id: 1, owner_key: 'WoodHelmet',
  });
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'item-effect-evidence-unresolved'));
  assert.equal(result.dependencyExpectations.projection_equipment_effect_attributes.length, 1);
  assert.equal(result.inputSnapshots.consumerRows.projection_equipment_effect_attributes.length, 2);
});

test('inactive defense rows still affect consumers because their actual SQL ignores status', async () => {
  const input = await fixture();
  input.consumerRows.items[0].status = 0;
  input.consumerRows.items[0].defense = 99;
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'local-defense-stale'));
});

test('new local fallback-image bytes change the exact consumer and candidate bindings', async () => {
  const input = await fixture();
  const before = await build(input);
  input.consumerRows.item_images[0].cached_url = `${prefix}another-managed-image.png`;
  const after = await build(input);
  assert.notEqual(before.consumerSnapshotSha256, after.consumerSnapshotSha256);
  assert.notEqual(before.candidateSha256, after.candidateSha256);
});

test('upstream baseline audit timestamps must also be calendar-valid even when retained unchanged', async () => {
  const input = await fixture();
  input.relationInput.currentRows.relation_armor_sets[0].created_at = '2026-02-30T00:00:00Z';
  await assert.rejects(build(input), /calendar|timestamp/);
});

test('Armor rows without effect text evidence block even when benefit expression and effect snapshots are empty', async () => {
  const input = await fixture();
  changePayload(input, 0, payload => {
    delete payload.armorSets[0].effectText;
    payload.armorSets[0].benefitExpression = null;
  });
  input.dependencyRows.relation_equipment_effect_attributes = [];
  input.consumerRows.projection_equipment_effect_attributes = [];
  const result = await build(input);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'source-effect-evidence-unresolved'));
});

test('missing armor attribute source and projection rows block despite local item defense', async () => {
  const input = await fixture();
  input.dependencyRows.relation_armor_attribute_rows = [];
  input.consumerRows.projection_item_armor_attributes = [];
  const result = await build(input);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-attribute-source-missing'));
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-attribute-projection-missing'));
  assert.equal(input.consumerRows.items[0].defense, 2);
});

test('mismatched armor attribute slot is blocked against the exact relation part role', async () => {
  const input = await fixture();
  const attribute = input.dependencyRows.relation_armor_attribute_rows[0];
  attribute.slot_group = 'body';
  const result = await build(input);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-attribute-slot-mismatch'));
});

test('inactive or deleted item-owner source effects cannot be treated as a verified zero-effect source', async () => {
  const input = await fixture();
  const attribute = input.dependencyRows.relation_armor_attribute_rows[0];
  attribute.raw_cells_json = JSON.stringify({ meleeDamage: '5%' });
  input.consumerRows.projection_item_armor_attributes[0].raw_cells_json = attribute.raw_cells_json;
  input.dependencyRows.relation_equipment_effect_attributes.push({
    id: 500, record_key: key('inactive-item-effect'), owner_kind: 'item', owner_record_key: attribute.record_key,
    owner_id: attribute.item_id, owner_key: attribute.item_internal_name, source_kind: 'armor_attribute_cell',
    source_line_index: 0, source_line: 'WoodHelmet meleeDamage: 5%', effect_index: 0, apply_scope: 'item_bonus',
    variant_label: 'WoodHelmet', item_internal_name: attribute.item_internal_name, slot_type: 'headSlot',
    stat_key: 'damage_bonus', stat_label_zh: '近战伤害', class_scope: 'melee', operation: 'add', value_decimal: 5,
    value_max_decimal: null, unit: 'percent', condition_text: null, raw_text: '5%', parse_status: 'parsed',
    source_revision_timestamp: revision, status: 0, deleted: 1,
  });
  const result = await build(input);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'item-effect-evidence-unresolved'));
});

test('retired consumer armor attributes cannot satisfy the required active projection', async () => {
  const input = await fixture();
  input.consumerRows.projection_item_armor_attributes[0].status = 0;
  input.consumerRows.projection_item_armor_attributes[0].deleted = 1;
  const result = await build(input);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-attribute-projection-stale'));
});

test('retired consumer item-owner effects excluded by PublicItemService do not block', async () => {
  const input = await fixture();
  input.consumerRows.projection_equipment_effect_attributes.push({
    id: 777, relation_record_key: key('foreign-item-effect'), owner_kind: 'item', owner_id: 1,
    owner_key: 'WoodHelmet', source_kind: 'armor_attribute_cell', source_line: 'stale', source_line_index: 0,
    effect_index: 0, apply_scope: 'item_bonus', variant_label: 'WoodHelmet', item_internal_name: 'WoodHelmet',
    slot_type: 'headSlot', stat_key: 'damage_bonus', stat_label_zh: '近战伤害', class_scope: 'melee', operation: 'add',
    value_decimal: 5, value_max_decimal: null, unit: 'percent', condition_text: null, raw_text: '5%', parse_status: 'parsed',
    confidence: 1, status: 0, deleted: 1,
  });
  const result = await build(input);
  assert.equal(result.acceptance.status, 'dependencies-satisfied', JSON.stringify(result.acceptance.blockers));
});

test('unresolved relation armor attribute evidence cannot be treated as a verified zero-effect source', async () => {
  const input = await fixture();
  input.dependencyRows.relation_armor_attribute_rows[0].review_status = 'unresolved';
  const result = await build(input);
  assert.equal(result.acceptance.status, 'blocked');
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-attribute-source-unresolved'));
});

test('active item-owner armor attribute effects bind to the exact relation and projection owner rows', async () => {
  const input = await fixture();
  const attribute = input.dependencyRows.relation_armor_attribute_rows[0];
  attribute.item_name_zh = 'WoodHelmet';
  attribute.raw_cells_json = JSON.stringify({ meleeDamage: '5%' });
  input.consumerRows.projection_item_armor_attributes[0].raw_cells_json = attribute.raw_cells_json;
  const effect = {
    id: 500, record_key: key('active-item-effect'), owner_kind: 'item', owner_record_key: attribute.record_key,
    owner_id: attribute.item_id, owner_key: attribute.item_internal_name, source_kind: 'armor_attribute_cell', source_locale: 'zh',
    source_line_index: 0, source_line: 'WoodHelmet meleeDamage: 5%', effect_index: 0, apply_scope: 'item_bonus',
    variant_label: 'WoodHelmet', item_internal_name: attribute.item_internal_name, slot_type: null,
    stat_key: 'damage_bonus', stat_label_zh: '近战伤害', class_scope: 'melee', operation: 'add', value_decimal: 5,
    value_max_decimal: null, unit: 'percent', condition_text: null, raw_text: '5%', parse_status: 'parsed',
    source_maint_table: 'maint_armor_attribute_rows', source_maint_record_key: null, source_maint_id: null,
    landing_source_id: null, landing_source_key: null, landing_content_hash: null, source_provider: 'terraria.wiki.gg',
    source_page: 'Armor', source_revision_timestamp: revision, confidence: 1, review_status: 'accepted',
    reason: 'parsed_from_armor_attribute_cell',
    raw_json: JSON.stringify({ cellKey: 'meleeDamage', cellValue: '5%', armorAttributeRecordKey: attribute.record_key }),
    status: 1, deleted: 0,
  };
  input.dependencyRows.relation_equipment_effect_attributes.push(effect);
  input.consumerRows.projection_equipment_effect_attributes.push({
    ...effect, id: 900, relation_record_key: effect.record_key, owner_id: effect.owner_id,
  });
  const result = await build(input);
  assert.equal(result.acceptance.blockers.some(row => row.code === 'item-effect-source-stale'), false, JSON.stringify(result.acceptance.blockers));
  assert.equal(result.acceptance.blockers.some(row => row.code === 'item-effect-evidence-unresolved'), false);
  assert.equal(result.dependencyExpectations.projection_equipment_effect_attributes.find(row => row.owner_kind === 'item').owner_id, 1);
});

test('item-owner effect evidence must preserve the producer source line and lineage fields', async () => {
  const input = await fixture();
  const attribute = input.dependencyRows.relation_armor_attribute_rows[0];
  attribute.raw_cells_json = JSON.stringify({ meleeDamage: '5%' });
  attribute.review_status = 'accepted';
  input.consumerRows.projection_item_armor_attributes = [];
  const effect = {
    id: 501, record_key: key('item-effect-source-line'), owner_kind: 'item', owner_record_key: attribute.record_key,
    owner_id: 1, owner_key: 'WoodHelmet', source_kind: 'armor_attribute_cell', source_locale: 'zh',
    source_line_index: 0, source_line: 'WRONG SOURCE LINE', effect_index: 0, apply_scope: 'item_bonus',
    variant_label: 'WoodHelmet', item_internal_name: 'WoodHelmet', slot_type: 'headSlot', stat_key: 'damage_bonus',
    stat_label_zh: '近战伤害', class_scope: 'melee', operation: 'add', value_decimal: 5,
    value_max_decimal: null, unit: 'percent', condition_text: null, raw_text: '5%', parse_status: 'parsed',
    source_maint_table: 'maint_armor_attribute_rows', source_maint_record_key: attribute.record_key,
    source_maint_id: 30, landing_source_id: null, landing_source_key: null, landing_content_hash: null,
    source_provider: 'terraria.wiki.gg', source_page: 'Armor', source_revision_timestamp: revision,
    confidence: 1, review_status: 'accepted', reason: 'parsed_from_armor_attribute_cell',
    raw_json: JSON.stringify({ cellKey: 'meleeDamage', cellValue: '5%', armorAttributeRecordKey: attribute.record_key }),
    status: 1, deleted: 0,
  };
  input.dependencyRows.relation_equipment_effect_attributes.push(effect);
  input.consumerRows.projection_equipment_effect_attributes.push({ ...effect, id: 901, relation_record_key: effect.record_key });
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'item-effect-source-stale'), JSON.stringify(result.acceptance.blockers));
});

function addProducerItemEffects(input, cells, { named = true } = {}) {
  const attribute = input.dependencyRows.relation_armor_attribute_rows[0];
  Object.assign(attribute, {
    raw_cells_json: JSON.stringify(cells), item_name_zh: named ? '木头盔' : null,
    item_page_title: null, source_maint_record_key: null, source_maint_id: null,
    landing_source_id: null, landing_source_key: null, landing_content_hash: null,
  });
  const effects = buildArmorAttributeEffectRows([camel(attribute)])
    .map((row, index) => ({ ...snake(row), id: 500 + index, status: 1, deleted: 0 }));
  input.dependencyRows.relation_equipment_effect_attributes.push(...effects);
  const projected = buildProjectionPayload({
    relationArmorAttributeRows: input.dependencyRows.relation_armor_attribute_rows.map(camel),
    relationEquipmentEffectAttributes: effects.map(camel),
  });
  input.consumerRows.projection_item_armor_attributes = projected.projectionItemArmorAttributes.map(snake);
  input.consumerRows.projection_equipment_effect_attributes.push(
    ...projected.projectionEquipmentEffectAttributes.map((row, index) => ({ ...snake(row), id: 900 + index })),
  );
  return effects;
}

for (const [cell, scope] of [['meleeCritChance', 'melee'], ['rangedCritChance', 'ranged'], ['magicCritChance', 'magic']]) {
  test(`accepts real producer ${scope} crit evidence and rejects an all-class replacement`, async () => {
    const input = await fixture();
    const [effect] = addProducerItemEffects(input, { [cell]: '5%' });
    const accepted = await build(input);
    assert.equal(accepted.acceptance.status, 'dependencies-satisfied', JSON.stringify(accepted.acceptance.blockers));
    effect.class_scope = 'all';
    const rejected = await build(input);
    assert.ok(rejected.acceptance.blockers.some(row => row.code === 'item-effect-source-stale'));
  });
}

test('accepts the producer null variant label when only the internal item name exists', async () => {
  const input = await fixture();
  addProducerItemEffects(input, { meleeDamage: '5%' }, { named: false });
  const result = await build(input);
  assert.equal(result.acceptance.status, 'dependencies-satisfied', JSON.stringify(result.acceptance.blockers));
});

test('retired old keys coexist with the active replacement while active duplicates still block', async () => {
  const input = await fixture();
  const [effect] = addProducerItemEffects(input, { meleeDamage: '5%' });
  const old = { ...effect, id: 800, record_key: key('retired-old-key'), status: 0, deleted: 1 };
  input.dependencyRows.relation_equipment_effect_attributes.push(old);
  const projection = input.consumerRows.projection_equipment_effect_attributes.find(row => row.owner_kind === 'item');
  input.consumerRows.projection_equipment_effect_attributes.push({
    ...projection, id: 801, relation_record_key: old.record_key, status: 0, deleted: 1,
  });
  const result = await build(input);
  assert.equal(result.acceptance.status, 'dependencies-satisfied', JSON.stringify(result.acceptance.blockers));
  old.status = 1;
  old.deleted = 0;
  const duplicate = await build(input);
  assert.ok(duplicate.acceptance.blockers.some(row => row.code === 'item-effect-evidence-unresolved'));
});

test('unrelated active attributes and effects do not become selected Armor member dependencies', async () => {
  const input = await fixture();
  const item = { ...input.relationInput.maintItems[0], id: 999, source_id: 999, internal_name: 'UnrelatedArmor' };
  input.relationInput.maintItems.push(item);
  input.dependencyRows.relation_armor_attribute_rows.push({
    ...input.dependencyRows.relation_armor_attribute_rows[0], id: 999, item_id: 999,
    item_internal_name: item.internal_name, record_key: key('unrelated-attribute'),
  });
  input.dependencyRows.relation_equipment_effect_attributes.push({
    ...input.dependencyRows.relation_equipment_effect_attributes[0], id: 999,
    record_key: key('unrelated-effect'), owner_kind: 'item', owner_id: 999,
    owner_record_key: key('unrelated-attribute'),
  });
  const result = await build(input);
  assert.equal(result.acceptance.status, 'dependencies-satisfied', JSON.stringify(result.acceptance.blockers));
  assert.equal(result.dependencyExpectations.projection_item_armor_attributes.some(row => row.item_id === 999), false);
});

for (const table of ['projection_item_armor_attributes', 'projection_equipment_effect_attributes']) {
  test(`inactive nondeleted ${table} still blocks because Armor admin reads it`, async () => {
    const input = await fixture();
    addProducerItemEffects(input, { meleeDamage: '5%' });
    const row = input.consumerRows[table].find(row => table === 'projection_item_armor_attributes' || row.owner_kind === 'item');
    input.consumerRows[table].push({ ...row, id: 777, relation_record_key: key(`inactive-extra:${table}`), status: 0, deleted: 0 });
    const result = await build(input);
    assert.ok(result.acceptance.blockers.some(blocker => blocker.code === (table === 'projection_item_armor_attributes'
      ? 'armor-attribute-projection-foreign' : 'effect-projection-foreign')), JSON.stringify(result.acceptance.blockers));
  });
}

test('multiple active source attributes for one member block instead of choosing a row by order', async () => {
  const input = await fixture();
  input.dependencyRows.relation_armor_attribute_rows.push({
    ...input.dependencyRows.relation_armor_attribute_rows[0], id: 888, record_key: key('duplicate-member-attribute'),
  });
  input.consumerRows.projection_item_armor_attributes = buildProjectionPayload({
    relationArmorAttributeRows: input.dependencyRows.relation_armor_attribute_rows.map(camel),
  }).projectionItemArmorAttributes.map(snake);
  const result = await build(input);
  assert.ok(result.acceptance.blockers.some(row => row.code === 'armor-attribute-source-ambiguous'));
});
