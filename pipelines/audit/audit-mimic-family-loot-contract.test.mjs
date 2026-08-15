import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateMimicFamilyRows,
} from './audit-mimic-family-loot-contract.mjs';

test('evaluateMimicFamilyRows requires exactly six ordinary Mimic accepted rows', () => {
  const rows = [
    ['DualHook', 'Mimics'],
    ['MagicDagger', 'Mimics'],
    ['PhilosophersStone', 'Mimics'],
    ['TitanGlove', 'Mimics'],
    ['StarCloak', 'Mimics'],
    ['CrossNecklace', 'Mimics'],
    ['Mace', 'Mimic'],
  ].map(([itemInternalName, sourceRefName]) => ({
    itemInternalName,
    itemName: itemInternalName,
    sourceRefName,
    sourceRefInternalName: sourceRefName === 'Mimic' ? 'Mimic' : null,
  }));

  const actual = evaluateMimicFamilyRows(rows);

  assert.equal(actual.auditStatus, 'blocked');
  assert.equal(actual.summary.accepted, 6);
  assert.equal(actual.summary.contractMismatch, 1);
  assert.deepEqual(actual.ordinaryMimic.acceptedItems, [
    'CrossNecklace',
    'DualHook',
    'MagicDagger',
    'PhilosophersStone',
    'StarCloak',
    'TitanGlove',
  ]);
  assert.equal(actual.mismatchRows[0].itemInternalName, 'Mace');
});

test('evaluateMimicFamilyRows blocks zero-loot ordinary Mimic', () => {
  const actual = evaluateMimicFamilyRows([]);

  assert.equal(actual.auditStatus, 'blocked');
  assert.equal(actual.ordinaryMimic.missingItems.length, 6);
  assert.equal(actual.checks.find((check) => check.id === 'ordinary_mimic_exact_contract').status, 'fail');
});
