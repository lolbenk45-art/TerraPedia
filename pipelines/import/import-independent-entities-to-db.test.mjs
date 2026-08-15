import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIndependentBuffColumnValueMap,
  buildIndependentNpcColumnValueMap,
  importArmorSets,
  importBuffs,
  importNpcs,
  importProjectiles,
  resolveMappedItem,
} from './import-independent-entities-to-db.mjs';

test('importBuffs skips unchanged existing buff entity rows', async () => {
  const record = buffRecord();
  const values = buildIndependentBuffColumnValueMap(record, 0);
  const conn = createFakeConnection({
    existingBuffs: new Map([[values.source_id, { id: 101, ...values, status: 1, deleted: 0 }]]),
  });
  const stats = makeStats();
  const relationStats = makeRelationStats();

  await importBuffs(conn, [record], emptyItemLookup(), emptySourceItemLookup(), stats, relationStats);

  assert.deepEqual(pickCounts(stats), { created: 0, updated: 0, skipped: 1 });
  assert.equal(conn.calls.some((call) => /\bINSERT INTO buffs\b/i.test(call.sql)), false);
});

test('importBuffs updates changed existing buff entity rows', async () => {
  const record = buffRecord();
  const values = buildIndependentBuffColumnValueMap(record, 0);
  const conn = createFakeConnection({
    existingBuffs: new Map([[
      values.source_id,
      { id: 101, ...values, tooltip_en: 'Stale tooltip', status: 1, deleted: 0 },
    ]]),
  });
  const stats = makeStats();

  await importBuffs(conn, [record], emptyItemLookup(), emptySourceItemLookup(), stats, makeRelationStats());

  assert.deepEqual(pickCounts(stats), { created: 0, updated: 1, skipped: 0 });
  assert.equal(conn.calls.some((call) => /\bINSERT INTO buffs\b/i.test(call.sql)), true);
});

test('importBuffs skips unchanged buff_source_items relations', async () => {
  const record = buffRecord({
    sourceItems: [{ itemId: 1, buffTime: 18000 }],
  });
  const values = buildIndependentBuffColumnValueMap(record, 0);
  const itemLookup = itemLookupWithSingleItem('WOOD', 11, 'Wood');
  const sourceItemLookup = { bySourceId: new Map([[1, 'WOOD']]) };
  const conn = createFakeConnection({
    existingBuffs: new Map([[values.source_id, { id: 101, ...values, status: 1, deleted: 0 }]]),
    buffSourceItems: new Map([[101, [{
      id: 301,
      buff_id: 101,
      source_item_id: 1,
      source_item_internal_name: 'WOOD',
      source_item_name: 'Wood',
      item_id: 11,
      buff_time: 18000,
      sort_order: 0,
    }]]]),
  });
  const stats = makeStats();
  const relationStats = makeRelationStats();

  await importBuffs(conn, [record], itemLookup, sourceItemLookup, stats, relationStats);

  assert.equal(relationStats.updated, 0);
  assert.equal(relationStats.skipped, 1);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM buff_source_items\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO buff_source_items\b/i.test(call.sql)), false);
});

test('importNpcs skips unchanged existing npc entity rows while preserving existing category id', async () => {
  const record = npcRecord();
  const context = {
    categoryByCode: new Map(),
    sourceItemLookup: emptySourceItemLookup(),
    itemLookup: emptyItemLookup(),
    npcZhMap: new Map(),
    existingCategoryId: 7,
  };
  const values = buildIndependentNpcColumnValueMap(record, 0, context);
  const conn = createFakeConnection({
    existingNpcs: new Map([[values.source_id, { id: 201, ...stripResolverFields(values), status: 1, deleted: 0 }]]),
  });
  const stats = makeStats();

  await importNpcs(conn, [record], emptyItemLookup(), emptySourceItemLookup(), new Map(), stats, makeNpcItemLinkStats());

  assert.deepEqual(pickCounts(stats), { created: 0, updated: 0, skipped: 1 });
  assert.equal(conn.calls.some((call) => /\bINSERT INTO npcs\b/i.test(call.sql)), false);
});

test('importProjectiles skips unchanged existing projectile entity rows', async () => {
  const record = projectileRecord();
  const existing = {
    id: 301,
    source_id: 9001,
    internal_name: 'WoodenArrowFriendly',
    name: 'Wooden Arrow Friendly',
    name_zh: '木箭',
    image_url: 'https://example.invalid/projectile.png',
    ai_style: 1,
    damage: 5,
    knock_back: 2.5,
    penetrate: 1,
    time_left: 600,
    width: 10,
    height: 10,
    scale: 1,
    friendly: 1,
    hostile: 0,
    tile_collide: 1,
    raw_json: JSON.stringify(record),
    status: 1,
    deleted: 0,
  };
  const conn = createFakeConnection({ existingProjectiles: new Map([[existing.source_id, existing]]) });
  const stats = makeStats();

  await importProjectiles(conn, [record], stats);

  assert.deepEqual(pickCounts(stats), { created: 0, updated: 0, skipped: 1 });
  assert.equal(conn.calls.some((call) => /\bINSERT INTO projectiles\b/i.test(call.sql)), false);
});

test('importArmorSets skips unchanged existing armor set entity rows', async () => {
  const record = armorSetRecord();
  const existing = {
    id: 401,
    source_key: 'ArmorSetBonus.Wood',
    text_key: 'ArmorSetBonus.Wood',
    benefit_expression: 'Increases defense by 1',
    primary_part: 'head',
    set_count: 1,
    unique_item_count: 3,
    sets_json: JSON.stringify(record.sets),
    unique_item_ids_json: JSON.stringify(record.uniqueItemIds),
    status: 1,
    deleted: 0,
  };
  const itemLookup = itemLookupWithWoodArmor();
  const sourceItemLookup = sourceItemLookupWithWoodArmor();
  const conn = createFakeConnection({ existingArmorSets: new Map([[existing.source_key, existing]]) });
  const stats = makeStats();
  const relationStats = makeRelationStats();

  await importArmorSets(conn, [record], itemLookup, sourceItemLookup, stats, relationStats);

  assert.deepEqual(pickCounts(stats), { created: 0, updated: 0, skipped: 1 });
  assert.equal(conn.calls.some((call) => /\bINSERT INTO armor_sets\b/i.test(call.sql)), false);
});

test('importArmorSets skips unchanged armor_set_items relations', async () => {
  const record = armorSetRecord();
  const existing = {
    id: 401,
    source_key: 'ArmorSetBonus.Wood',
    text_key: 'ArmorSetBonus.Wood',
    benefit_expression: 'Increases defense by 1',
    primary_part: 'head',
    set_count: 1,
    unique_item_count: 3,
    sets_json: JSON.stringify(record.sets),
    unique_item_ids_json: JSON.stringify(record.uniqueItemIds),
    status: 1,
    deleted: 0,
  };
  const conn = createFakeConnection({
    existingArmorSets: new Map([[existing.source_key, existing]]),
    armorSetItems: new Map([
      [401, [
        {
          id: 501,
          armor_set_id: 401,
          set_variant_index: 0,
          part_index: 0,
          source_item_id: 1,
          item_id: 11,
          item_internal_name: 'WOOD_HELMET',
          item_name: 'Wood Helmet',
        },
        {
          id: 502,
          armor_set_id: 401,
          set_variant_index: 0,
          part_index: 1,
          source_item_id: 2,
          item_id: 12,
          item_internal_name: 'WOOD_BREASTPLATE',
          item_name: 'Wood Breastplate',
        },
        {
          id: 503,
          armor_set_id: 401,
          set_variant_index: 0,
          part_index: 2,
          source_item_id: 3,
          item_id: 13,
          item_internal_name: 'WOOD_GREAVES',
          item_name: 'Wood Greaves',
        },
      ]],
    ]),
  });
  const stats = makeStats();
  const relationStats = makeRelationStats();

  await importArmorSets(conn, [record], itemLookupWithWoodArmor(), sourceItemLookupWithWoodArmor(), stats, relationStats);

  assert.equal(relationStats.updated, 0);
  assert.equal(relationStats.skipped, 3);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM armor_set_items\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO armor_set_items\b/i.test(call.sql)), false);
});

test('resolveMappedItem remains available for item relation mapping tests', () => {
  const itemLookup = { byInternal: new Map([['WOOD', { id: 1, internalName: 'WOOD', name: 'Wood' }]]) };
  const actual = resolveMappedItem(9, { bySourceId: new Map([[9, 'WOOD']]) }, itemLookup);

  assert.equal(actual.dbItem.id, 1);
});

function buffRecord(overrides = {}) {
  return {
    id: 55,
    internalName: 'WellFed',
    englishName: 'Well Fed',
    localized: {
      en: { tooltip: 'Minor improvements to all stats' },
      zh: { name: '吃得好', tooltip: '所有属性小幅提升' },
    },
    imageUrl: 'https://example.invalid/well-fed.png',
    type: 'positive',
    sourceItems: [],
    immuneNpcs: [],
    immuneNpcSample: [],
    sourceEvidence: { pageTitle: 'Well Fed' },
    ...overrides,
  };
}

function npcRecord() {
  return {
    id: 123,
    internalName: 'Guide',
    name: 'Guide',
    localized: {
      zh: { name: '向导', namesub: 'Andrew' },
    },
    flags: { boss: false, friendly: true },
    extras: { townNPC: true },
    netID: 22,
    type: 22,
    aiStyle: 7,
    combat: { damage: 10, defense: 15, lifeMax: 250, knockBackResist: 0.5 },
    dimensions: { width: 18, height: 40, scale: 1 },
    economy: { value: 0 },
    buffImmune: '[]',
  };
}

function projectileRecord() {
  return {
    id: 9001,
    internalName: 'WoodenArrowFriendly',
    name: 'Wooden Arrow Friendly',
    localized: { zh: { name: '木箭' } },
    imageUrl: 'https://example.invalid/projectile.png',
    aiStyle: 1,
    combat: { damage: 5, knockBack: 2.5, penetrate: 1 },
    lifecycle: { timeLeft: 600 },
    dimensions: { width: 10, height: 10, scale: 1 },
    flags: { friendly: true, hostile: false, tileCollide: true },
  };
}

function armorSetRecord() {
  return {
    textKey: 'ArmorSetBonus.Wood',
    benefitExpression: 'Increases defense by 1',
    primaryPart: 'head',
    setCount: 1,
    uniqueItemIds: [1, 2, 3],
    sets: [[1, 2, 3]],
  };
}

function emptyItemLookup() {
  return { byId: new Map(), byInternal: new Map() };
}

function emptySourceItemLookup() {
  return { bySourceId: new Map() };
}

function itemLookupWithWoodArmor() {
  return {
    byId: new Map(),
    byInternal: new Map([
      ['WOOD_HELMET', { id: 11, internalName: 'WOOD_HELMET', name: 'Wood Helmet' }],
      ['WOOD_BREASTPLATE', { id: 12, internalName: 'WOOD_BREASTPLATE', name: 'Wood Breastplate' }],
      ['WOOD_GREAVES', { id: 13, internalName: 'WOOD_GREAVES', name: 'Wood Greaves' }],
    ]),
  };
}

function itemLookupWithSingleItem(internalName, id, name) {
  return {
    byId: new Map(),
    byInternal: new Map([[internalName, { id, internalName, name }]]),
  };
}

function sourceItemLookupWithWoodArmor() {
  return {
    bySourceId: new Map([
      [1, 'WOOD_HELMET'],
      [2, 'WOOD_BREASTPLATE'],
      [3, 'WOOD_GREAVES'],
    ]),
  };
}

function makeStats() {
  return { input: 0, created: 0, updated: 0, skipped: 0, errors: [] };
}

function makeRelationStats() {
  return { input: 0, created: 0, updated: 0, skipped: 0, errors: [], unmatched: 0, unmatchedSamples: [] };
}

function makeNpcItemLinkStats() {
  return {
    banner: { checked: 0, resolved: 0, unmatched: 0, unmatchedSamples: [] },
    catchItem: { checked: 0, resolved: 0, unmatched: 0, unmatchedSamples: [] },
  };
}

function pickCounts(stats) {
  return { created: stats.created, updated: stats.updated, skipped: stats.skipped };
}

function stripResolverFields(values) {
  const { bannerMapped, catchMapped, ...row } = values;
  return row;
}

function createFakeConnection({
  existingBuffs = new Map(),
  existingNpcs = new Map(),
  existingProjectiles = new Map(),
  existingArmorSets = new Map(),
  buffSourceItems = new Map(),
  armorSetItems = new Map(),
} = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ method: 'execute', sql, params });
      if (/FROM\s+buffs\b/i.test(sql)) {
        return [[existingBuffs.get(params[0])].filter(Boolean)];
      }
      if (/FROM\s+buff_source_items\b/i.test(sql)) {
        return [buffSourceItems.get(params[0]) ?? []];
      }
      if (/FROM\s+npcs\b/i.test(sql)) {
        return [[existingNpcs.get(params[0])].filter(Boolean)];
      }
      if (/FROM\s+projectiles\b/i.test(sql)) {
        return [[existingProjectiles.get(params[0])].filter(Boolean)];
      }
      if (/FROM\s+armor_sets\b/i.test(sql)) {
        return [[existingArmorSets.get(params[0])].filter(Boolean)];
      }
      if (/FROM\s+armor_set_items\b/i.test(sql)) {
        return [armorSetItems.get(params[0]) ?? []];
      }
      return [{ affectedRows: 1, insertId: 999 }];
    },
  };
}
