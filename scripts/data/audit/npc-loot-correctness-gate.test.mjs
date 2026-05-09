import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcLootCorrectnessReport,
  runNpcLootCorrectnessGate,
} from './npc-loot-correctness-gate.mjs';

test('buildNpcLootCorrectnessReport blocks wrong Mimic rows and collective buckets', () => {
  const report = buildNpcLootCorrectnessReport({
    sourceRows: [
      { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics' },
      { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics' },
      { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics' },
      { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics' },
      { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics' },
      { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics' },
      { itemInternalName: 'Mace', itemName: 'Mace', sourceRefName: 'Mimic', sourceRefInternalName: 'Mimic' },
      { itemInternalName: 'Bacon', itemName: 'Bacon', sourceRefName: 'Pigrons' },
      { itemInternalName: 'GoldCoin', itemName: 'Gold Coin', sourceRefName: 'Gold Chest' },
    ],
    mimicVariantStates: [
      { internalName: 'BigMimicCorruption', localLootCount: 0, relationLootCount: 0, projectionLootCount: 0 },
    ],
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.contractMismatch, 1);
  assert.equal(report.summary.genericBucket, 1);
  assert.equal(report.summary.nonNpcSourceMisclassified, 1);
  assert.equal(report.mimicCorrectness.ordinaryMimic.acceptedItems.length, 6);
  assert.equal(report.mimicCorrectness.blockedVariants[0].internalName, 'BigMimicCorruption');
});

test('buildNpcLootCorrectnessReport fails when blocked Mimic variants have loot', () => {
  const report = buildNpcLootCorrectnessReport({
    sourceRows: [
      { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics' },
      { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics' },
      { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics' },
      { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics' },
      { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics' },
      { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics' },
    ],
    mimicVariantStates: [
      { internalName: 'BigMimicCorruption', localLootCount: 1, relationLootCount: 0, projectionLootCount: 0 },
      { internalName: 'BigMimicCrimson', localLootCount: 0, relationLootCount: 2, projectionLootCount: 0 },
      { internalName: 'BigMimicHallow', localLootCount: 0, relationLootCount: 0, projectionLootCount: 3 },
      { internalName: 'IceMimic', localLootCount: 9, relationLootCount: 9, projectionLootCount: 9 },
    ],
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.pollutedVariants, 3);
  assert.equal(report.summary.blockingCount, 3);
  assert.deepEqual(
    report.mimicCorrectness.pollutedVariants.map((row) => row.internalName).sort(),
    ['BigMimicCorruption', 'BigMimicCrimson', 'BigMimicHallow']
  );
  assert.equal(
    report.checks.find((check) => check.id === 'mimic_variants_explicitly_blocked').status,
    'fail'
  );
});

test('runNpcLootCorrectnessGate returns blocked report when DB is unavailable', async () => {
  const result = await runNpcLootCorrectnessGate(
    { writeReport: false, dateTag: '2026-05-09' },
    {
      mysqlFactory: {
        async createConnection() {
          throw new Error('connection refused');
        },
      },
      config: { database: { host: '127.0.0.1', port: 3306, username: 'root', password: 'secret' } },
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'db_unavailable');
  assert.equal(result.reportPath, null);
});

test('runNpcLootCorrectnessGate queries DB with SELECT statements only', async () => {
  const statements = [];
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes('FROM `terria_v1_local`.`npcs`')) {
        return [[
          { internalName: 'Mimic', localLootCount: 6, relationLootCount: 6, projectionLootCount: 6 },
          { internalName: 'IceMimic', localLootCount: 9, relationLootCount: 9, projectionLootCount: 9 },
          { internalName: 'WaterBoltMimic', localLootCount: 1, relationLootCount: 1, projectionLootCount: 1 },
          { internalName: 'BigMimicCorruption', localLootCount: 0, relationLootCount: 0, projectionLootCount: 0 },
        ]];
      }
      if (sql.includes('FROM `terria_v1_relation`.`item_npc_loot_relations`')) {
        return [[
          { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics', sourceRefInternalName: 'Mimic' },
          { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics', sourceRefInternalName: 'Mimic' },
          { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics', sourceRefInternalName: 'Mimic' },
          { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics', sourceRefInternalName: 'Mimic' },
          { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics', sourceRefInternalName: 'Mimic' },
          { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics', sourceRefInternalName: 'Mimic' },
        ]];
      }
      return [[]];
    },
  };

  const result = await runNpcLootCorrectnessGate(
    { writeReport: false, dateTag: '2026-05-09' },
    { connection }
  );

  assert.equal(result.report.auditStatus, 'pass');
  assert.equal(result.report.evidenceHealth, 'sufficient');
  assert.equal(result.report.summary.blockedVariants, 1);
  assert.ok(statements.length >= 2);
  assert.ok(statements.every((sql) => /^\s*SELECT\b/i.test(sql)));
});
