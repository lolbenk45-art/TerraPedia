import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS,
  buildEquivalentArmorAttributeLookup,
  flattenEquivalentArmorAttributePairs
} from './equivalent-armor-attribute-rules.mjs';

test('equivalent armor attribute rules include known interchangeable families', () => {
  const groupIds = EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS.map((group) => group.id);

  assert.deepEqual(groupIds, [
    'hallowed_ancient_hallowed',
    'shadow_ancient_shadow',
    'jungle_ancient_cobalt',
    'snow_pink_snow',
    'necro_ancient_necro'
  ]);
});

test('flattenEquivalentArmorAttributePairs exposes bidirectional item pairs with evidence', () => {
  const pairs = flattenEquivalentArmorAttributePairs();
  const pairKey = (pair) => `${pair.sourceInternalName}->${pair.targetInternalName}`;
  const keys = new Set(pairs.map(pairKey));

  assert.ok(keys.has('ShadowHelmet->AncientShadowHelmet'));
  assert.ok(keys.has('AncientShadowHelmet->ShadowHelmet'));
  assert.ok(keys.has('JungleHat->AncientCobaltHelmet'));
  assert.ok(keys.has('EskimoHood->PinkEskimoHood'));
  assert.ok(keys.has('NecroHelmet->AncientNecroHelmet'));
  assert.equal(keys.has('AnglerHat->UpgradedFishingHead'), false);
  assert.ok(pairs.every((pair) => pair.groupId && pair.evidence));
});

test('equivalent armor attribute rules do not reuse group ids or item slots accidentally', () => {
  const groupIds = new Set();
  const memberKeys = new Set();

  for (const group of EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS) {
    assert.equal(groupIds.has(group.id), false, `duplicate group id: ${group.id}`);
    groupIds.add(group.id);

    for (const itemGroup of group.groups) {
      assert.ok(itemGroup.length >= 2, `group ${group.id} has a singleton equivalent item group`);
      const key = `${group.id}:${itemGroup.slice().sort().join('|')}`;
      assert.equal(memberKeys.has(key), false, `duplicate item group: ${key}`);
      memberKeys.add(key);
      assert.equal(new Set(itemGroup).size, itemGroup.length, `duplicate item inside ${key}`);
    }
  }
});

test('buildEquivalentArmorAttributeLookup returns resolved maint item equivalents only', () => {
  const maintItems = [
    { source_id: 100, internal_name: 'ShadowHelmet', name_zh: '暗影头盔' },
    { source_id: 956, internal_name: 'AncientShadowHelmet', name_zh: '远古暗影头盔' },
    { source_id: 228, internal_name: 'JungleHat', name_zh: '丛林帽' }
  ];

  const lookup = buildEquivalentArmorAttributeLookup(maintItems);

  assert.deepEqual(lookup.get('ShadowHelmet').map((item) => item.internal_name), ['AncientShadowHelmet']);
  assert.deepEqual(lookup.get('AncientShadowHelmet').map((item) => item.internal_name), ['ShadowHelmet']);
  assert.equal(lookup.has('JungleHat'), false);
});
