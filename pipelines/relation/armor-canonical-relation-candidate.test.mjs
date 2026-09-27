import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildArmorCanonicalMaintCandidate } from '../maint/armor-canonical-maint-candidate.mjs';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { buildArmorSetRelations } from './armor-set-processor.mjs';
import {
  buildArmorCanonicalRelationCandidate as build,
  buildArmorCanonicalRelationIdIndependentCandidate,
} from './armor-canonical-relation-candidate.mjs';
const prefix = 'https://media.example.test/terrapedia-images/items/';
const at = '2026-09-24T01:00:00.000Z';
const revision = '2026-09-23T23:00:00.000Z';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tables = ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'];
const snake = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));

function fixture() {
  const armor = {
    source: 'terraria.wiki.gg:Module:ArmorSetBonuses', sourcePageTitle: 'Module:ArmorSetBonuses',
    sourceRevisionTimestamp: revision, fetchedAt: at, totalArmorSets: 1,
    armorSets: [{ textKey: 'ArmorSetBonus.Wood', benefitExpression: 'WoodBonus', primaryPart: null,
      setCount: 1, sets: [[1, 2, 3]], uniqueItemIds: [1, 2, 3] }],
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
    fetched_at: at, parsed_at: at, payload_json: JSON.stringify(payload), content_hash: hash(payload),
    artifact_role: 'source_evidence', parse_status: 'ok', is_current: 1,
  });
  return {
    maintInput: {
      landingRows: [landing(31, 'armor_sets_raw', 'wiki.module.armorsetbonuses', armor),
        landing(32, 'armor_set_images_raw', 'wiki.armor_set_images', images)],
      currentRows: { maint_armor_sets: [], maint_armor_set_images: [] }, managedImageUrlPrefixes: [prefix],
    },
    maintItems: ['WoodHelmet', 'WoodBreastplate', 'WoodGreaves'].map((internalName, index) => ({
      id: index + 10, source_id: index + 1, internal_name: internalName,
      english_name: internalName, raw_json: JSON.stringify({ [ ['headSlot', 'bodySlot', 'legSlot'][index] ]: index + 1 }),
      source_provider: 'terraria.wiki.gg', landing_source_id: 30, landing_source_key: 'wiki.module.iteminfo',
      landing_content_hash: 'a'.repeat(64), status: 1, deleted: 0,
    })),
    currentRows: Object.fromEntries(tables.map(table => [table, []])),
  };
}

function changePayload(input, index, mutate) {
  const landing = input.maintInput.landingRows[index];
  const payload = JSON.parse(landing.payload_json);
  mutate(payload);
  landing.payload_json = JSON.stringify(payload);
  landing.content_hash = hash(payload);
}

async function existingFixture() {
  const input = fixture();
  input.maintInput.currentRows = (await buildArmorCanonicalMaintCandidate(input.maintInput)).expectedRows;
  for (const rows of Object.values(input.maintInput.currentRows)) rows.forEach((row, index) => { row.id = 50 + index; });
  const raw = buildArmorSetRelations({
    maintArmorSets: input.maintInput.currentRows.maint_armor_sets,
    maintArmorSetImages: input.maintInput.currentRows.maint_armor_set_images,
    maintItems: input.maintItems, managedImageUrlPrefixes: [prefix],
  });
  for (const [index, name] of ['relationArmorSets', 'relationArmorSetItems', 'relationArmorSetImages'].entries()) {
    input.currentRows[tables[index]] = raw[name].map((row, offset) => ({ ...snake(row), id: 100 + offset, status: 1, deleted: 0 }));
  }
  // Historic keys need not equal the processor's latest content-derived keys.
  input.currentRows.relation_armor_sets[0].record_key = 'f'.repeat(64);
  for (const row of [...input.currentRows.relation_armor_set_items, ...input.currentRows.relation_armor_set_images]) row.armor_set_record_key = 'f'.repeat(64);
  input.currentRows.relation_armor_set_images[0].record_key = 'e'.repeat(64);
  return input;
}

test('derives only canonical maint relations with no allocated IDs or execution authority', async () => {
  const input = fixture();
  const unchanged = structuredClone(input);
  const result = await build(input);
  assert.equal(result.schemaVersion, 'armor-canonical-relation-candidate/v1');
  assert.equal(result.executable, false);
  assert.deepEqual(result.tables, tables);
  assert.equal(result.summary.inserts, 5);
  assert.deepEqual(result.deletes, []);
  assert.equal(result.requiresRemovalReview, false);
  assert.equal(result.unresolvedGeneratedIds.length, 5);
  assert.equal(result.unresolvedDependencies.length, 2);
  const owner = result.expectedRows.relation_armor_sets[0];
  for (const rows of Object.values(result.expectedRows)) for (const row of rows) {
    assert.equal(Object.hasOwn(row, 'id'), false);
    assert.match(row.record_key, /^[a-f0-9]{64}$/);
    if (row.armor_set_record_key) assert.equal(row.armor_set_record_key, owner.record_key);
  }
  assert.deepEqual(result.expectedRows.relation_armor_set_items.map(row => row.item_internal_name), input.maintItems.map(row => row.internal_name));
  assert.deepEqual(input, unchanged);
});

test('ID-independent relation derivation carries unresolved landing/maint lineage without allocating IDs', async () => {
  const input = fixture();
  for (const row of input.maintInput.landingRows) delete row.id;
  input.maintInput.allowUnmaterializedLandingIds = true;
  const result = await buildArmorCanonicalRelationIdIndependentCandidate(input);
  assert.equal(result.executable, false);
  assert.ok(result.unresolvedDependencies.length >= 2);
  assert.ok(result.inputSnapshots.maintInput.allowUnmaterializedLandingIds);
  assert.equal(result.expectedRows.relation_armor_sets[0].source_maint_id, null);
  assert.match(result.expectedRows.relation_armor_sets[0].source_maint_record_key, /^[a-f0-9]{64}$/);
  for (const rows of Object.values(result.expectedRows)) for (const row of rows) assert.equal(Object.hasOwn(row, 'id'), false);
});

test('changed content preserves existing relation IDs, keys and child parent keys', async () => {
  const input = await existingFixture();
  changePayload(input, 0, payload => { payload.armorSets[0].benefitExpression = 'UpdatedBonus'; });
  const result = await build(input);
  const row = result.changes.relation_armor_sets.updates[0];
  assert.equal(row.after.id, 100);
  assert.equal(row.after.record_key, 'f'.repeat(64));
  assert.equal(row.after.benefit_expression, 'UpdatedBonus');
  assert.equal(result.summary.inserts, 0);
  assert.deepEqual(result.unresolvedDependencies, []);
  for (const part of result.expectedRows.relation_armor_set_items) assert.equal(part.armor_set_record_key, row.after.record_key);
});

test('image reorder retains its logical identity and key while changing processor-derived content', async () => {
  const input = await existingFixture();
  changePayload(input, 1, payload => { payload.armorSetImages[0].sortOrder = 7; });
  const result = await build(input);
  const image = result.changes.relation_armor_set_images.updates[0].after;
  assert.equal(image.id, 100);
  assert.equal(image.record_key, 'e'.repeat(64));
  assert.equal(image.armor_set_record_key, 'f'.repeat(64));
  assert.equal(image.sort_order, 7);
  assert.equal(result.summary.inserts, 0);
});

test('new image keys are deterministic even when image sort changes before insertion', async () => {
  const input = fixture();
  const first = await build(input);
  changePayload(input, 1, payload => { payload.armorSetImages[0].sortOrder = 9; });
  const next = await build(input);
  assert.equal(next.expectedRows.relation_armor_set_images[0].record_key, first.expectedRows.relation_armor_set_images[0].record_key);
  assert.equal(next.expectedRows.relation_armor_set_images[0].id, undefined);
});

test('removed source and images are preserved and never rederived from unmatched maint rows', async () => {
  const input = await existingFixture();
  changePayload(input, 0, payload => { payload.armorSets[0].textKey = 'ArmorSetBonus.New'; });
  changePayload(input, 1, payload => { payload.armorSetImages = []; payload.totalArmorSetImages = 0; });
  const result = await build(input);
  assert.equal(result.summary.preserved, 5);
  assert.equal(result.summary.inserts, 4);
  assert.equal(result.requiresRemovalReview, true);
  assert.deepEqual(result.removedIdentities.relation_armor_sets, ['ArmorSetBonus.Wood']);
  for (const table of tables) assert.deepEqual(result.changes[table].preserved, input.currentRows[table]);
});

test('part replacement inserts a new identity and retains the old slot for explicit removal review', async () => {
  const input = await existingFixture();
  input.maintItems.push({ ...input.maintItems[0], id: 90, source_id: 4, internal_name: 'NewHelmet' });
  changePayload(input, 0, payload => { payload.armorSets[0].sets = [[4, 2, 3]]; payload.armorSets[0].uniqueItemIds = [2, 3, 4]; });
  const result = await build(input);
  assert.equal(result.changes.relation_armor_set_items.inserts.length, 1);
  assert.equal(result.changes.relation_armor_set_items.inserts[0].id, undefined);
  assert.equal(result.changes.relation_armor_set_items.preserved[0].item_source_id, 1);
  assert.equal(result.requiresRemovalReview, true);
});

test('inactive unmatched records remain intact without becoming item dependencies', async () => {
  const input = await existingFixture();
  const oldParent = { ...input.currentRows.relation_armor_sets[0], id: 99, record_key: 'c'.repeat(64), text_key: 'ArmorSetBonus.Retired', status: 0 };
  const oldPart = { ...input.currentRows.relation_armor_set_items[0], id: 99, record_key: 'b'.repeat(64), armor_set_record_key: oldParent.record_key,
    text_key: oldParent.text_key, item_source_id: 999, item_internal_name: 'RetiredHelmet', status: 0 };
  input.currentRows.relation_armor_sets.push(oldParent);
  input.currentRows.relation_armor_set_items.push(oldPart);
  const result = await build(input);
  assert.deepEqual(result.changes.relation_armor_set_items.preserved, [oldPart]);
  assert.equal(result.requiresRemovalReview, false);
});

test('detaches and freezes inputs and hash bindings across asynchronous maint derivation', async () => {
  const input = await existingFixture();
  const expected = structuredClone(input);
  const pending = build(input);
  input.maintItems[0].internal_name = 'Tampered';
  input.currentRows.relation_armor_sets[0].record_key = '0'.repeat(64);
  const result = await pending;
  assert.deepEqual(result.inputSnapshots, expected);
  assert.equal(Object.isFrozen(result.inputSnapshots.maintItems[0]), true);
  assert.equal(Object.isFrozen(result.expectedRows.relation_armor_sets[0]), true);
  for (const field of ['sourceSnapshotSha256', 'maintBaselineSha256', 'baselineSha256', 'itemDependenciesSha256', 'inputSha256', 'candidateSha256']) assert.match(result[field], /^sha256:[a-f0-9]{64}$/);
  const changed = structuredClone(expected);
  changed.maintItems[0].english_name = 'Updated name';
  const next = await build(changed);
  assert.notEqual(next.itemDependenciesSha256, result.itemDependenciesSha256);
  assert.notEqual(next.candidateSha256, result.candidateSha256);
});

test('deterministic snapshots and output do not depend on table or dependency row order', async () => {
  const input = await existingFixture();
  const first = await build(input);
  input.maintItems.reverse();
  input.maintInput.landingRows.reverse();
  for (const rows of Object.values(input.currentRows)) rows.reverse();
  assert.deepEqual(await build(input), first);
});

test('SQL JSON, Date and boolean representations do not manufacture relation changes', async () => {
  const input = await existingFixture();
  for (const rows of Object.values(input.currentRows)) for (const row of rows) for (const key of Object.keys(row)) {
    if (key.endsWith('_json') && row[key] != null) row[key] = JSON.parse(row[key]);
    if (key.endsWith('_timestamp') && row[key] != null) row[key] = new Date(row[key]);
    if (key === 'is_primary') row[key] = Number(row[key]);
    if (key === 'confidence') row[key] = Number(row[key]).toFixed(4);
  }
  const result = await build(input);
  assert.equal(result.summary.updates, 0);
  assert.equal(result.summary.unchanged, 5);
});

test('object-form landing payloads retain producer key order during maint verification', async () => {
  const input = await existingFixture();
  for (const row of input.maintInput.landingRows) row.payload_json = JSON.parse(row.payload_json);
  assert.equal((await buildArmorCanonicalMaintCandidate(input.maintInput)).summary.updates, 0);
  const original = structuredClone(input);
  const result = await build(input);
  assert.equal(result.summary.updates, 0);
  for (const [index, row] of result.inputSnapshots.maintInput.landingRows.entries()) {
    assert.equal(JSON.stringify(row.payload_json), JSON.stringify(original.maintInput.landingRows[index].payload_json));
    assert.equal(hash(row.payload_json), row.content_hash);
  }
  input.maintInput.landingRows[0].payload_json.armorSets[0].benefitExpression = 'Tampered';
  await assert.rejects(build(input), /hash/);
  assert.deepEqual(result.inputSnapshots, original);
});

test('frozen snapshots convert caller Dates to immutable ISO strings without changing payload order', async () => {
  const input = await existingFixture();
  input.currentRows.relation_armor_sets[0].source_revision_timestamp = new Date(revision);
  const date = input.currentRows.relation_armor_sets[0].source_revision_timestamp;
  const pending = build(input);
  date.setTime(0);
  const result = await pending;
  const snapshotDate = result.inputSnapshots.currentRows.relation_armor_sets[0].source_revision_timestamp;
  assert.equal(snapshotDate, revision);
  assert.equal(typeof snapshotDate, 'string');
  assert.equal(result.expectedRows.relation_armor_sets[0].source_revision_timestamp, revision);
});

test('item dependency trace retains required lineage while accepting nullable revision and no record key', async () => {
  const input = await existingFixture();
  for (const item of input.maintItems) item.source_revision_timestamp = null;
  const result = await build(input);
  assert.equal(result.summary.updates, 0);
  for (const part of result.expectedRows.relation_armor_set_items) {
    assert.equal(part.source_maint_record_key, null);
    assert.equal(part.source_provider, 'terraria.wiki.gg');
    assert.equal(part.landing_source_id, 30);
    assert.equal(part.landing_source_key, 'wiki.module.iteminfo');
    assert.equal(part.landing_content_hash, 'a'.repeat(64));
    assert.equal(part.source_revision_timestamp, null);
  }
});

for (const field of ['source_provider', 'landing_source_id', 'landing_source_key', 'landing_content_hash']) {
  test(`rejects missing required item dependency lineage ${field}`, async () => {
    const input = await existingFixture();
    for (const row of input.maintItems) delete row[field];
    await assert.rejects(build(input), /lineage/);
  });
}

for (const [field, value] of [
  ['source_provider', ''], ['landing_source_id', 0], ['landing_source_key', ' '], ['landing_content_hash', 'malformed'],
]) {
  test(`rejects malformed required item dependency lineage ${field}`, async () => {
    const input = await existingFixture();
    input.maintItems[0][field] = value;
    await assert.rejects(build(input), /lineage/);
  });
}

test('rejects nonexistent maint item record keys instead of fabricating relation lineage', async () => {
  const input = await existingFixture();
  input.maintItems[0].record_key = 'b'.repeat(64);
  await assert.rejects(build(input), /record_key|lineage/);
});

for (const value of [0, 1, '0', '1']) {
  test(`accepts numeric slot ${JSON.stringify(value)} and negative absence sentinels`, async () => {
    const input = await existingFixture();
    input.maintItems[0].raw_json = JSON.stringify({ headSlot: value, bodySlot: -1, legSlot: '-1' });
    const result = await build(input);
    const part = result.expectedRows.relation_armor_set_items.find(row => row.item_source_id === 1);
    assert.equal(part.part_role, 'head');
    assert.equal(part.equipment_slot_id, Number(value));
  });
}

for (const [name, value] of [['false', false], ['true', true], ['array', []], ['array scalar', [1]], ['object', {}]]) {
  for (const field of ['headSlot', 'bodySlot']) {
    test(`rejects ${name} in populated item slot ${field}`, async () => {
      const input = await existingFixture();
      input.maintItems[0].raw_json = JSON.stringify({ headSlot: 1, [field]: value });
      await assert.rejects(build(input), /slot/);
    });
  }
}

test('rejects malformed alternate slot strings instead of treating them as absent', async () => {
  const input = await existingFixture();
  input.maintItems[0].raw_json = '{"headSlot":1,"bodySlot":"not-a-slot"}';
  await assert.rejects(build(input), /slot/);
});

test('rejects malformed raw slot evidence even when an explicit slot column masks it', async () => {
  const input = await existingFixture();
  input.maintItems[0].head_slot = 1;
  input.maintItems[0].raw_json = '{"headSlot":false}';
  await assert.rejects(build(input), /slot/);
});

for (const column of ['head_slot', 'body_slot', 'leg_slot']) {
  test(`rejects nonexistent maint item slot override ${column}`, async () => {
    const input = await existingFixture();
    input.maintItems[0][column] = column === 'head_slot' ? 1 : -1;
    await assert.rejects(build(input), /slot.*column|nonexistent/);
  });
}

test('rejects top-level slot overrides that contradict authoritative raw item evidence', async () => {
  const input = await existingFixture();
  input.maintItems[0].head_slot = 1;
  input.maintItems[0].body_slot = -1;
  input.maintItems[0].raw_json = '{"bodySlot":1}';
  await assert.rejects(build(input), /slot.*column|nonexistent/);
});

for (const mode of ['insert', 'update']) {
  // module_generated_at is producer VARCHAR(64), unlike these UTC DATETIME fields.
  for (const field of ['source_revision_timestamp', 'landing_fetched_at', 'landing_parsed_at']) {
    test(`rejects malformed item trace ${field} before ${mode} derivation`, async () => {
      const input = mode === 'insert' ? fixture() : await existingFixture();
      input.maintItems[0][field] = 'invalid';
      await assert.rejects(build(input), /timestamp|trace/);
    });
  }
  for (const value of [null, revision, new Date(revision)]) {
    test(`accepts ${value === null ? 'null' : value instanceof Date ? 'Date' : 'ISO'} item revision during ${mode} derivation`, async () => {
      const input = mode === 'insert' ? fixture() : await existingFixture();
      input.maintItems[0].source_revision_timestamp = value;
      const result = await build(input);
      const part = result.expectedRows.relation_armor_set_items.find(row => row.item_source_id === 1);
      assert.equal(part.source_revision_timestamp, value === null ? null : revision);
    });
  }
}

test('rejects malformed dependency trace even when processor output would not change', async () => {
  const input = await existingFixture();
  assert.equal((await build(input)).summary.updates, 0);
  input.maintItems[0].landing_fetched_at = 'invalid';
  await assert.rejects(build(input), /timestamp|trace/);
});

test('accepts real item extractor producer text with canonical head/body/leg dependencies', async () => {
  const input = fixture();
  const generated = '2026-04-22 10:00:00 (+00:00)';
  const itemModule = {
    _generated: generated, _terrariaversion: '1.4.5.6',
    1: { name: 'Wood Helmet', internalName: 'WoodHelmet', headSlot: 1 },
    2: { name: 'Wood Breastplate', internalName: 'WoodBreastplate', bodySlot: 2 },
    3: { name: 'Wood Greaves', internalName: 'WoodGreaves', legSlot: 3 },
  };
  const payload = {
    moduleContent: `return { ["data"] = [=====[${JSON.stringify(itemModule)}]=====] }`,
    pageTitle: 'Module:Iteminfo/data',
  };
  const extracted = await extractMaintEntitiesFromLandingRow({
    id: 30, dataset_type: 'items_raw', provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data', source_key: 'wiki.module.iteminfo',
    source_revision_timestamp: revision, content_hash: hash(payload), fetched_at: at, parsed_at: at,
    payload_json: JSON.stringify(payload),
  });
  assert.equal(extracted.scope, 'items');
  input.maintItems = extracted.rows.map(({ scope, tableName, ...row }, index) => {
    assert.equal(tableName, 'maint_items');
    return { ...snake(row), id: 10 + index, status: 1, deleted: 0 };
  });
  const result = await build(input);
  assert.deepEqual(result.expectedRows.relation_armor_set_items.map(row => row.part_role), ['head', 'body', 'legs']);
  assert.equal(result.inputSnapshots.maintItems[0].module_generated_at, generated);
});

for (const value of [null, 'x'.repeat(64)]) {
  test(`accepts nullable or bounded producer module text ${value === null ? 'null' : '64 characters'}`, async () => {
    const input = fixture();
    input.maintItems[0].module_generated_at = value;
    assert.equal((await build(input)).inputSnapshots.maintItems[0].module_generated_at, value);
  });
}

for (const value of [true, {}, '', 'x'.repeat(65), 'producer\ntext']) {
  test(`rejects malformed producer module text ${JSON.stringify(value)}`, async () => {
    const input = fixture();
    input.maintItems[0].module_generated_at = value;
    await assert.rejects(build(input), /module_generated_at|producer/);
  });
}

for (const mode of ['insert', 'update']) {
  test(`rejects impossible UTC calendar revision before relation ${mode}`, async () => {
    const input = mode === 'insert' ? fixture() : await existingFixture();
    input.maintItems[0].source_revision_timestamp = '2026-02-30T12:00:00.000Z';
    await assert.rejects(build(input), /timestamp|calendar/);
  });
  for (const value of ['2024-02-29T12:00:00Z', '2024-02-29T12:00:00.123456Z', new Date('2024-02-29T12:00:00.123Z')]) {
    test(`preserves valid leap-day revision ${String(value)} during relation ${mode}`, async () => {
      const input = mode === 'insert' ? fixture() : await existingFixture();
      input.maintItems[0].source_revision_timestamp = value;
      const result = await build(input);
      const expected = value instanceof Date ? value.toISOString() : value;
      assert.equal(result.inputSnapshots.maintItems[0].source_revision_timestamp, expected);
      assert.equal(result.expectedRows.relation_armor_set_items.find(row => row.item_source_id === 1).source_revision_timestamp, expected);
    });
  }
}

test('rejects an impossible relation baseline timestamp even when normalization would hide the delta', async () => {
  const input = await existingFixture();
  input.maintItems[0].source_revision_timestamp = '2026-03-02T12:00:00.000Z';
  input.currentRows.relation_armor_set_items[0].source_revision_timestamp = '2026-02-30T12:00:00.000Z';
  await assert.rejects(build(input), /timestamp|calendar/);
});

test('composed relation candidate rejects impossible upstream module revision instead of normalizing it', async () => {
  const input = fixture();
  const impossible = '2026-02-30T12:00:00.000Z';
  changePayload(input, 0, payload => { payload.sourceRevisionTimestamp = impossible; });
  input.maintInput.landingRows[0].source_revision_timestamp = impossible;
  await assert.rejects(build(input), /timestamp|calendar/);
});

for (const [name, mutate, pattern] of [
  ['missing table', x => { delete x.currentRows.relation_armor_set_images; }, /complete|table/],
  ['unrelated table', x => { x.currentRows.relation_items = []; }, /complete|table/],
  ['caller executable authority', x => { x.executable = true; }, /input|unsupported/],
  ['edited maint candidate', x => { x.maintCandidate = { executable: true, sourceSnapshotSha256: 'fake' }; }, /input|unsupported/],
  ['duplicate sourceId', x => { x.maintItems[1].source_id = 1; }, /ambiguous|duplicate/],
  ['duplicate internalName', x => { x.maintItems[1].internal_name = 'WoodHelmet'; }, /ambiguous|duplicate/],
  ['missing part dependency', x => { x.maintItems.pop(); }, /dependency|missing/],
  ['inactive part dependency', x => { x.maintItems[0].status = 0; }, /dependency|inactive/],
  ['contradictory part join', x => { x.currentRows.relation_armor_set_items[0].item_internal_name = 'WoodBreastplate'; }, /identity|join/],
  ['stale part maint ID', x => { x.currentRows.relation_armor_set_items[0].source_maint_id = 999; }, /identity|join|dependency/],
  ['foreign parent key', x => { x.currentRows.relation_armor_set_items[0].armor_set_record_key = 'a'.repeat(64); }, /parent|owner/],
  ['foreign image text', x => { x.currentRows.relation_armor_set_images[0].text_key = 'ArmorSetBonus.Other'; }, /parent|owner/],
  ['malformed row ID', x => { x.currentRows.relation_armor_sets[0].id = 0; }, /identity/],
  ['malformed record key', x => { x.currentRows.relation_armor_sets[0].record_key = 'invalid'; }, /identity|parent/],
  ['duplicate image identity', x => { x.currentRows.relation_armor_set_images.push({ ...x.currentRows.relation_armor_set_images[0], id: 777, record_key: 'a'.repeat(64) }); }, /duplicate/],
  ['duplicate active slot', x => { x.currentRows.relation_armor_set_items.push({ ...x.currentRows.relation_armor_set_items[0], id: 777, record_key: 'a'.repeat(64), item_source_id: 2, item_internal_name: 'WoodBreastplate' }); }, /slot|duplicate/],
  ['inactive matching relation', x => { x.currentRows.relation_armor_sets[0].status = 0; }, /inactive|reactivat/],
  ['wrong source owner', x => { x.currentRows.relation_armor_sets[0].source_maint_table = 'maint_buffs'; }, /scope|owner/],
  ['wrong derived image owner', x => { x.maintInput.currentRows.maint_armor_set_images[0].source_maint_table = 'maint_buffs'; }, /scope|owner/],
  ['unknown item slot', x => { x.maintItems[0].raw_json = '{}'; }, /slot|role/],
  ['wrong item slot', x => { x.maintItems[0].raw_json = '{"bodySlot":1}'; }, /slot|role/],
  ['ambiguous item slots', x => { x.maintItems[0].raw_json = '{"headSlot":1,"bodySlot":1}'; }, /slot|role/],
  ['malformed parent definition', x => { x.currentRows.relation_armor_sets[0].sets_json = '{}'; }, /sets|definition/],
  ['wrong parent entity scope', x => { x.currentRows.relation_armor_sets[0].raw_json = '{"entityType":"buff"}'; }, /scope|owner/],
  ['unverified managed image', x => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl = 'https://evil.test/file.png'; }), /managed/],
  ['stale landing hash', x => { x.maintInput.landingRows[0].content_hash = '0'.repeat(64); }, /hash/],
]) {
  test(`rejects ${name}`, async () => {
    const input = await existingFixture();
    mutate(input);
    await assert.rejects(build(input), pattern);
  });
}

test('retains part image role and stable relation identity through a source refresh', async () => {
  const input = await existingFixture();
  changePayload(input, 1, payload => {
    payload.armorSetImages[0].imageRole = 'part';
    payload.armorSetImages[0].isPrimary = false;
    payload.armorSetImages[0].sortOrder = 9;
  });
  input.maintInput.currentRows.maint_armor_set_images[0].image_role = 'part';
  input.currentRows.relation_armor_set_images[0].image_role = 'part';
  const result = await build(input);
  const image = result.expectedRows.relation_armor_set_images[0];
  assert.equal(image.image_role, 'part');
  assert.equal(image.id, 100);
  assert.equal(image.record_key, 'e'.repeat(64));
  assert.equal(image.armor_set_record_key, 'f'.repeat(64));
  assert.equal(image.sort_order, 9);
  assert.equal(result.changes.relation_armor_set_images.inserts.length, 0);
  assert.deepEqual(result.removedIdentities.relation_armor_set_images, []);
});
