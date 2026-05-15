import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMappedItem as resolveBuffMappedItem,
  resolveSourceItemCount as resolveBuffSourceItemCount
} from './import-buffs-to-db.mjs';
import {
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
