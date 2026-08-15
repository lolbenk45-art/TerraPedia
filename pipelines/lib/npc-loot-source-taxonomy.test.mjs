import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyNpcLootSource,
  MIMIC_CONTRACT_ITEM_INTERNAL_NAMES,
} from './npc-loot-source-taxonomy.mjs';

test('classifyNpcLootSource accepts only reviewed Mimics to ordinary Mimic rows', () => {
  const accepted = classifyNpcLootSource({
    itemInternalName: 'DualHook',
    sourceRefName: 'Mimics',
    sourceRefInternalName: null,
  });

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.targetNpcInternalName, 'Mimic');
  assert.equal(accepted.sourceRefResolution, 'reviewed_mimic_contract');
  assert.equal(MIMIC_CONTRACT_ITEM_INTERNAL_NAMES.has('DualHook'), true);
});

test('classifyNpcLootSource blocks wrong exact ordinary Mimic rows', () => {
  for (const itemInternalName of ['BandofRegeneration', 'CloudinaBottle', 'Extractinator', 'FlareGun', 'HermesBoots', 'Mace', 'ShoeSpikes']) {
    const actual = classifyNpcLootSource({
      itemInternalName,
      sourceRefName: 'Mimic',
      sourceRefInternalName: 'Mimic',
    });

    assert.equal(actual.status, 'contract_mismatch', itemInternalName);
    assert.equal(actual.materializable, false, itemInternalName);
    assert.equal(actual.reason, 'ordinary_mimic_contract_mismatch');
  }
});

test('classifyNpcLootSource excludes reviewed rejected item-page ordinary Mimic rows', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'Mace',
    sourceRefName: 'Mimic',
    sourceRefInternalName: 'Mimic',
    sourceRefResolution: 'exact_internal_name',
    landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  });

  assert.equal(actual.status, 'reviewed_mimic_contract_rejected');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'ordinary_mimic_contract_mismatch');
  assert.equal(actual.sourceRefResolution, 'reviewed_mimic_contract_rejected');
});

test('classifyNpcLootSource forbids exact ordinary Mimic promotion even for contract items', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'DualHook',
    sourceRefName: 'Mimic',
    sourceRefInternalName: 'Mimic',
  });

  assert.equal(actual.status, 'contract_mismatch');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'ordinary_mimic_exact_promotion_forbidden');
});

test('classifyNpcLootSource accepts Mimic variant exact NPC-scoped rows', () => {
  for (const [sourceRefName, sourceRefInternalName] of [
    ['Present Mimic', 'PresentMimic'],
    ['Corrupt Mimic', 'BigMimicCorruption'],
    ['Crimson Mimic', 'BigMimicCrimson'],
    ['Hallowed Mimic', 'BigMimicHallow'],
    ['Jungle Mimic', 'BigMimicJungle'],
  ]) {
    const actual = classifyNpcLootSource({
      itemInternalName: 'DaedalusStormbow',
      sourceRefName,
      sourceRefInternalName,
      sourceRefResolution: 'exact_internal_name',
    });

    assert.equal(actual.status, 'accepted', sourceRefInternalName);
    assert.equal(actual.materializable, true, sourceRefInternalName);
    assert.equal(actual.targetNpcInternalName, sourceRefInternalName, sourceRefInternalName);
    assert.equal(actual.reason, 'variant_exact_npc_source', sourceRefInternalName);
  }
});

test('classifyNpcLootSource blocks Mimic variant names without exact NPC-scoped evidence', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'DaedalusStormbow',
    sourceRefName: 'Crimson Mimic',
    sourceRefInternalName: null,
    sourceRefResolution: null,
  });

  assert.equal(actual.status, 'contract_mismatch');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'mimic_variant_requires_exact_npc_source');
});

test('classifyNpcLootSource blocks non-NPC sources even with exact Mimic variant metadata', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'LifeDrain',
    sourceRefName: 'Gold Chest',
    sourceRefInternalName: 'BigMimicCrimson',
    sourceRefResolution: 'exact_internal_name',
  });

  assert.equal(actual.status, 'non_npc_source_misclassified');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'source_ref_is_not_npc');
});

test('classifyNpcLootSource keeps non-contract Mimics rows as generic buckets', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'DaedalusStormbow',
    sourceRefName: 'Mimics',
  });

  assert.equal(actual.status, 'generic_bucket');
  assert.equal(actual.materializable, false);
});

test('classifyNpcLootSource blocks unknown plural or group-like npc buckets', () => {
  for (const sourceRefName of ['Skeletons', 'Pirates', 'Angry Bones variants', 'Goblin Army']) {
    const actual = classifyNpcLootSource({
      itemInternalName: 'AnyItem',
      sourceRefName,
    });

    assert.equal(actual.status, 'generic_bucket', sourceRefName);
    assert.equal(actual.materializable, false, sourceRefName);
  }
});

test('classifyNpcLootSource allows authoritative exact plural npc names', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'Bone',
    sourceRefName: 'Angry Bones',
    sourceRefInternalName: 'AngryBones',
    sourceRefResolution: 'exact_internal_name',
  });

  assert.equal(actual.status, 'accepted');
  assert.equal(actual.materializable, true);
});

test('classifyNpcLootSource accepts reviewed page-level shared loot with explicit target identity', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'ScarecrowHat',
    sourceRefName: 'Scarecrow',
    sourceRefInternalName: 'Scarecrow7',
    sourceRefResolution: 'reviewed_page_level_shared_loot',
  });

  assert.equal(actual.status, 'accepted');
  assert.equal(actual.materializable, true);
  assert.equal(actual.targetNpcInternalName, 'Scarecrow7');
  assert.equal(actual.sourceRefResolution, 'reviewed_page_level_shared_loot');
});

test('classifyNpcLootSource rejects reviewed page-level shared loot outside pinned targets', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'Shackle',
    sourceRefName: 'Zombie',
    sourceRefInternalName: 'ArmedZombie',
    sourceRefResolution: 'reviewed_page_level_shared_loot',
  });

  assert.equal(actual.status, 'contract_mismatch');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'reviewed_page_level_shared_loot_requires_pinned_target');
});

test('classifyNpcLootSource blocks other collective buckets and non-NPC sources', () => {
  for (const sourceRefName of ['Pigrons', 'Mummies', 'Ghouls', 'Jellyfish', 'Sand Sharks', 'Slimes', 'The Twins']) {
    assert.equal(classifyNpcLootSource({ itemInternalName: 'AnyItem', sourceRefName }).status, 'generic_bucket', sourceRefName);
  }

  for (const sourceRefName of ['Gold Chest', 'Azure Crate', 'Treasure Bag (Moon Lord)', 'Ash tree', 'Present', 'Shadow Orb']) {
    assert.equal(classifyNpcLootSource({ itemInternalName: 'AnyItem', sourceRefName }).status, 'non_npc_source_misclassified', sourceRefName);
  }
});

test('classifyNpcLootSource reclassifies pseudo-source rows as non-NPC before missing identity handling', () => {
  for (const sourceRefName of ['Bonus drop', 'Geode', 'Expert Mode', 'Pigronata', 'Shadow Hammer']) {
    const actual = classifyNpcLootSource({ itemInternalName: null, sourceRefName });
    assert.equal(actual.status, 'non_npc_source_misclassified', sourceRefName);
    assert.equal(actual.materializable, false, sourceRefName);
  }
});

test('classifyNpcLootSource keeps bonusdrop item labels source-only even with exact NPC metadata', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'Bomb',
    itemName: 'bonusdrop:Bomb',
    sourceRefName: 'Baby Slime',
    sourceRefInternalName: 'BabySlime',
    sourceRefResolution: 'exact_internal_name',
  });

  assert.equal(actual.status, 'reviewed_non_npc_source_exclusion');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'mode_or_bonus_bucket');
});

test('classifyNpcLootSource keeps reviewed ordinary slime item-page bonus mirrors source-only', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'Bomb',
    itemName: 'Bomb',
    sourceRefName: 'Baby Slime',
    sourceRefInternalName: 'BabySlime',
    sourceRefResolution: 'exact_internal_name',
    landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  });

  assert.equal(actual.status, 'reviewed_non_npc_source_exclusion');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'reviewed_slime_bonus_drop_source_only');
});

test('classifyNpcLootSource keeps Slimer item-page drops materializable', () => {
  const actual = classifyNpcLootSource({
    itemInternalName: 'Blindfold',
    itemName: 'Blindfold',
    sourceRefName: 'Slimer',
    sourceRefInternalName: 'Slimer',
    sourceRefResolution: 'exact_internal_name',
    landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  });

  assert.equal(actual.status, 'accepted');
  assert.equal(actual.materializable, true);
  assert.equal(actual.targetNpcInternalName, 'Slimer');
});

test('classifyNpcLootSource applies reviewed non-NPC source exclusions without materializing rows', () => {
  const actual = classifyNpcLootSource(
    {
      itemInternalName: 'GoldCoin',
      sourceRefName: 'Gold Chest',
      sourceRefInternalName: 'GoldChestNpcLikeName',
      sourceRefResolution: 'exact_internal_name',
    },
    {
      reviewedNonNpcSourceExclusions: [{
        sourceType: 'drop',
        sourceRefType: 'npc',
        matchType: 'exact',
        sourceRefName: 'Gold Chest',
        reason: 'chest_container',
      }],
      sourceType: 'drop',
      sourceRefType: 'npc',
    }
  );

  assert.equal(actual.status, 'reviewed_non_npc_source_exclusion');
  assert.equal(actual.materializable, false);
  assert.equal(actual.targetNpcInternalName, null);
  assert.equal(actual.reason, 'chest_container');
  assert.equal(actual.sourceRefResolution, 'reviewed_non_npc_source_exclusion');
});

test('classifyNpcLootSource applies reviewed boss-lane source exclusions', () => {
  const actual = classifyNpcLootSource(
    {
      itemInternalName: 'WaffleIron',
      sourceRefName: 'Mechdusa',
      sourceRefResolution: 'no_match',
    },
    {
      reviewedNonNpcSourceExclusions: [{
        sourceType: 'drop',
        sourceRefType: 'npc',
        matchType: 'exact',
        sourceRefName: 'Mechdusa',
        reason: 'boss_lane_reference_source',
      }],
      sourceType: 'drop',
      sourceRefType: 'npc',
    }
  );

  assert.equal(actual.status, 'reviewed_non_npc_source_exclusion');
  assert.equal(actual.materializable, false);
  assert.equal(actual.reason, 'boss_lane_reference_source');
});

test('classifyNpcLootSource requires anchored reviewed regex exclusions', () => {
  const matched = classifyNpcLootSource(
    { itemInternalName: 'AnyItem', sourceRefName: 'Treasure Bag (Moon Lord)' },
    {
      reviewedNonNpcSourceExclusions: [{
        sourceType: 'drop',
        sourceRefType: 'npc',
        matchType: 'regex',
        sourceRefName: '^Treasure Bag \\(.+\\)$',
        reason: 'treasure_bag_container',
      }],
      sourceType: 'drop',
      sourceRefType: 'npc',
    }
  );
  const ignored = classifyNpcLootSource(
    { itemInternalName: 'AnyItem', sourceRefName: 'Treasure Bag (Moon Lord)' },
    {
      reviewedNonNpcSourceExclusions: [{
        sourceType: 'drop',
        sourceRefType: 'npc',
        matchType: 'regex',
        sourceRefName: 'Treasure Bag',
        reason: 'treasure_bag_container',
      }],
      sourceType: 'drop',
      sourceRefType: 'npc',
    }
  );

  assert.equal(matched.status, 'reviewed_non_npc_source_exclusion');
  assert.equal(ignored.status, 'non_npc_source_misclassified');
});

test('classifyNpcLootSource preserves explicit controls', () => {
  assert.equal(classifyNpcLootSource({
    itemInternalName: 'IceBlade',
    sourceRefName: 'Ice Mimic',
    sourceRefInternalName: 'IceMimic',
  }).status, 'accepted');

  assert.equal(classifyNpcLootSource({
    itemInternalName: 'WaterBolt',
    sourceRefName: 'Water Bolt Mimic',
    sourceRefInternalName: 'WaterBoltMimic',
  }).status, 'accepted');
});
