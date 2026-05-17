import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBuffColumnValueMap,
  buildBuffSourceItemUnmatchedSample as buildBuffUnmatchedSample,
  resolveMappedItem as resolveBuffMappedItem,
  resolveSourceItemCount as resolveBuffSourceItemCount
} from './import-buffs-to-db.mjs';
import {
  buildIndependentNpcColumnValueMap,
  buildIndependentBuffColumnValueMap,
  buildBuffSourceItemUnmatchedSample as buildIndependentEntityBuffUnmatchedSample,
  resolveMappedItem as resolveIndependentEntityMappedItem,
  resolveSourceItemCount as resolveIndependentEntitySourceItemCount
} from './import-independent-entities-to-db.mjs';

function makeLookups() {
  const dbItem = {
    id: 47,
    internalName: 'CursedArrow',
    name: 'Cursed Arrow'
  };
  return {
    sourceItemLookup: {
      bySourceId: new Map()
    },
    itemLookup: {
      byInternal: new Map([
        ['CursedArrow', dbItem]
      ])
    },
    dbItem
  };
}

test('import-buffs source item mapping falls back to raw internalName when itemId is missing', () => {
  const { sourceItemLookup, itemLookup, dbItem } = makeLookups();

  const actual = resolveBuffMappedItem(null, sourceItemLookup, itemLookup, {
    internalName: 'CursedArrow',
    name: '诅咒箭'
  });

  assert.deepEqual(actual, {
    sourceItemId: null,
    internalName: 'CursedArrow',
    dbItem,
    reason: null
  });
});

test('independent entity import source item mapping falls back to raw internalName when itemId is missing', () => {
  const { sourceItemLookup, itemLookup, dbItem } = makeLookups();

  const actual = resolveIndependentEntityMappedItem(null, sourceItemLookup, itemLookup, {
    internalName: 'CursedArrow',
    name: '诅咒箭'
  });

  assert.deepEqual(actual, {
    sourceItemId: null,
    internalName: 'CursedArrow',
    dbItem,
    reason: null
  });
});

test('source item mapping reports unmatched raw internalName even when itemId is missing', () => {
  const sourceItemLookup = { bySourceId: new Map() };
  const itemLookup = { byInternal: new Map() };

  assert.deepEqual(
    resolveBuffMappedItem(null, sourceItemLookup, itemLookup, {
      internalName: 'MissingSourceItem',
      name: 'Missing Source Item'
    }),
    {
      sourceItemId: null,
      internalName: 'MissingSourceItem',
      dbItem: null,
      reason: 'internal_name_not_found_in_db_items'
    }
  );
  assert.deepEqual(
    resolveIndependentEntityMappedItem(null, sourceItemLookup, itemLookup, {
      internalName: 'MissingSourceItem',
      name: 'Missing Source Item'
    }),
    {
      sourceItemId: null,
      internalName: 'MissingSourceItem',
      dbItem: null,
      reason: 'internal_name_not_found_in_db_items'
    }
  );
});

test('source item count falls back to sourceItems length when explicit count is missing', () => {
  const record = {
    sourceItems: [
      { internalName: 'CursedArrow' },
      { internalName: 'CursedBullet' }
    ]
  };

  assert.equal(resolveBuffSourceItemCount(record), 2);
  assert.equal(resolveIndependentEntitySourceItemCount(record), 2);
});

test('source item mapping does not guess from pageTitle or localized names', () => {
  const sourceItemLookup = { bySourceId: new Map() };
  const itemLookup = {
    byInternal: new Map([
      ['CursedArrow', { id: 47, internalName: 'CursedArrow', name: 'Cursed Arrow' }]
    ])
  };
  const sourceItem = {
    pageTitle: 'Cursed Arrow',
    name: 'Cursed Arrow',
    nameZh: '诅咒箭',
    resolveStatus: 'unresolved'
  };

  assert.deepEqual(resolveBuffMappedItem(null, sourceItemLookup, itemLookup, sourceItem), {
    sourceItemId: null,
    internalName: null,
    dbItem: null,
    reason: 'missing_source_item_id'
  });
  assert.deepEqual(resolveIndependentEntityMappedItem(null, sourceItemLookup, itemLookup, sourceItem), {
    sourceItemId: null,
    internalName: null,
    dbItem: null,
    reason: 'missing_source_item_id'
  });
});

test('unmatched source item report keeps resolver and evidence context', () => {
  const record = {
    id: 39,
    internalName: 'CursedInferno',
    sourceEvidence: {
      provider: 'terraria.wiki.gg',
      pageTitle: 'Cursed Inferno',
      sourceSection: '原因'
    }
  };
  const sourceItem = {
    pageTitle: 'Unknown Wand',
    name: 'Unknown Wand',
    nameZh: '未知法杖',
    sourceSection: '来自玩家',
    sourceProvider: 'terraria.wiki.gg',
    resolveStatus: 'unresolved'
  };
  const mapped = {
    sourceItemId: null,
    internalName: null,
    dbItem: null,
    reason: 'missing_source_item_id'
  };
  const expected = {
    reason: 'missing_source_item_id',
    buffSourceId: 39,
    buffInternalName: 'CursedInferno',
    sourceItemId: null,
    standardizedItemInternalName: null,
    rawSourceItemInternalName: null,
    rawSourceItemName: 'Unknown Wand',
    rawSourceItemNameZh: '未知法杖',
    pageTitle: 'Unknown Wand',
    resolveStatus: 'unresolved',
    sourceSection: '来自玩家',
    sourceProvider: 'terraria.wiki.gg',
    evidencePageTitle: 'Cursed Inferno',
    evidenceSourceSection: '原因',
    evidenceSourceProvider: 'terraria.wiki.gg',
    sortOrder: 0
  };

  assert.deepEqual(buildBuffUnmatchedSample(record, 'CursedInferno', sourceItem, mapped, 0), expected);
  assert.deepEqual(
    buildIndependentEntityBuffUnmatchedSample(record, 'CursedInferno', sourceItem, mapped, 0),
    expected
  );
});

test('buff import column maps preserve full immune NPCs and source evidence JSON', () => {
  const record = {
    id: 323,
    internalName: 'OnFire3',
    englishName: 'Hellfire',
    sourceItems: [{ internalName: 'Flamethrower' }],
    immuneNpcs: [{ internalName: 'MeteorHead' }, { internalName: 'Demon' }],
    immuneNpcSample: [{ internalName: 'MeteorHead' }],
    sourceEvidence: {
      provider: 'terraria.wiki.gg',
      pageTitle: 'Hellfire',
      parseStatus: 'parsed',
      unresolvedFacts: []
    }
  };

  for (const values of [
    buildBuffColumnValueMap(record, 0, 12),
    buildIndependentBuffColumnValueMap(record, 0, 12)
  ]) {
    assert.deepEqual(JSON.parse(values.immune_npcs_json), record.immuneNpcs);
    assert.deepEqual(JSON.parse(values.source_evidence_json), record.sourceEvidence);
  }
});

test('independent NPC import maps extras townNPC into is_town_npc column', () => {
  const categoryByCode = new Map([
    ['CATEGORY_NPC_FRIENDLY_TOWN', 356],
    ['CATEGORY_NPC_FRIENDLY_OTHER', 357],
    ['CATEGORY_NPC_ENEMY', 354]
  ]);

  const record = {
    id: 17,
    internalName: 'Merchant',
    name: 'Merchant',
    flags: { friendly: true },
    extras: { townNPC: true },
    combat: { damage: 10, defense: 15, lifeMax: 250, knockBackResist: 0.5 },
    dimensions: { width: 18, height: 40, scale: 1 },
    economy: { value: 0 }
  };

  const actual = buildIndependentNpcColumnValueMap(record, 0, {
    categoryByCode,
    sourceItemLookup: { bySourceId: new Map() },
    itemLookup: { byInternal: new Map() },
    npcZhMap: new Map()
  });

  assert.equal(actual.category_id, 356);
  assert.equal(actual.is_boss, 0);
  assert.equal(actual.is_friendly, 1);
  assert.equal(actual.is_town_npc, 1);
});

test('independent NPC import keeps non-town friendly NPCs out of is_town_npc', () => {
  const categoryByCode = new Map([
    ['CATEGORY_NPC_FRIENDLY_TOWN', 356],
    ['CATEGORY_NPC_FRIENDLY_OTHER', 357],
    ['CATEGORY_NPC_ENEMY', 354]
  ]);

  const record = {
    id: 369,
    internalName: 'BoundWizard',
    name: 'Bound Wizard',
    flags: { friendly: true },
    extras: {},
    combat: {},
    dimensions: {},
    economy: {}
  };

  const actual = buildIndependentNpcColumnValueMap(record, 0, {
    categoryByCode,
    sourceItemLookup: { bySourceId: new Map() },
    itemLookup: { byInternal: new Map() },
    npcZhMap: new Map()
  });

  assert.equal(actual.category_id, 357);
  assert.equal(actual.is_friendly, 1);
  assert.equal(actual.is_town_npc, 0);
});
