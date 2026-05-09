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

test('classifyNpcLootSource blocks unreviewed Mimic variant exact rows', () => {
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

    assert.equal(actual.status, 'contract_mismatch', sourceRefInternalName);
    assert.equal(actual.materializable, false, sourceRefInternalName);
    assert.equal(actual.reason, 'mimic_variant_requires_reviewed_mapping', sourceRefInternalName);
  }
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

test('classifyNpcLootSource blocks other collective buckets and non-NPC sources', () => {
  for (const sourceRefName of ['Pigrons', 'Mummies', 'Ghouls', 'Jellyfish', 'Sand Sharks', 'Slimes', 'The Twins']) {
    assert.equal(classifyNpcLootSource({ itemInternalName: 'AnyItem', sourceRefName }).status, 'generic_bucket', sourceRefName);
  }

  for (const sourceRefName of ['Gold Chest', 'Azure Crate', 'Treasure Bag (Moon Lord)', 'Ash tree', 'Present', 'Shadow Orb']) {
    assert.equal(classifyNpcLootSource({ itemInternalName: 'AnyItem', sourceRefName }).status, 'non_npc_source_misclassified', sourceRefName);
  }
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
