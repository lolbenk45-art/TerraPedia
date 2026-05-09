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

test('buildNpcLootCorrectnessReport accepts Mimic variants with exact NPC-scoped source rows', () => {
  const report = buildNpcLootCorrectnessReport({
    sourceRows: [
      { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics' },
      { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics' },
      { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics' },
      { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics' },
      { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics' },
      { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics' },
      { itemInternalName: 'LifeDrain', itemName: 'Life Drain', sourceRefName: 'Crimson Mimic', sourceRefInternalName: 'BigMimicCrimson', sourceRefResolution: 'exact_internal_name' },
      { itemInternalName: 'DartPistol', itemName: 'Dart Pistol', sourceRefName: 'Crimson Mimic', sourceRefInternalName: 'BigMimicCrimson', sourceRefResolution: 'exact_internal_name' },
    ],
    mimicVariantStates: [
      { internalName: 'BigMimicCrimson', localLootCount: 0, relationLootCount: 2, projectionLootCount: 0 },
      { internalName: 'IceMimic', localLootCount: 9, relationLootCount: 9, projectionLootCount: 9 },
    ],
  });

  assert.equal(report.auditStatus, 'pass');
  assert.equal(report.summary.pollutedVariants, 0);
  assert.equal(report.summary.acceptedVariantRows, 2);
  assert.equal(
    report.checks.find((check) => check.id === 'mimic_variants_have_exact_source').status,
    'pass'
  );
});

test('buildNpcLootCorrectnessReport blocks Mimic variant loot counts not backed by exact source rows', () => {
  const report = buildNpcLootCorrectnessReport({
    sourceRows: [
      { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics' },
      { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics' },
      { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics' },
      { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics' },
      { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics' },
      { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics' },
      { itemInternalName: 'LifeDrain', itemName: 'Life Drain', sourceRefName: 'Crimson Mimic', sourceRefInternalName: 'BigMimicCrimson', sourceRefResolution: 'exact_internal_name' },
    ],
    mimicVariantStates: [
      { internalName: 'BigMimicCrimson', localLootCount: 2, relationLootCount: 1, projectionLootCount: 1 },
    ],
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.pollutedVariants, 1);
  assert.equal(report.summary.blockingCount, 1);
  assert.equal(report.mimicCorrectness.pollutedVariants[0].internalName, 'BigMimicCrimson');
  assert.equal(report.mimicCorrectness.pollutedVariants[0].acceptedVariantRows, 1);
  assert.equal(report.mimicCorrectness.pollutedVariants[0].reason, 'variant_loot_count_not_backed_by_exact_source_rows');
});

test('buildNpcLootCorrectnessReport blocks Mimic variant item identity drift even when counts match', () => {
  const report = buildNpcLootCorrectnessReport({
    sourceRows: [
      { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics' },
      { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics' },
      { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics' },
      { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics' },
      { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics' },
      { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics' },
      { itemInternalName: 'LifeDrain', itemName: 'Life Drain', sourceRefName: 'Crimson Mimic', sourceRefInternalName: 'BigMimicCrimson', sourceRefResolution: 'exact_internal_name' },
      { itemInternalName: 'DartPistol', itemName: 'Dart Pistol', sourceRefName: 'Crimson Mimic', sourceRefInternalName: 'BigMimicCrimson', sourceRefResolution: 'exact_internal_name' },
    ],
    mimicVariantStates: [
      {
        internalName: 'BigMimicCrimson',
        localLootCount: 2,
        relationLootCount: 2,
        projectionLootCount: 0,
        localItemInternalNames: ['LifeDrain', 'WrongItem'],
        relationItemInternalNames: ['LifeDrain', 'DartPistol'],
      },
    ],
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.pollutedVariants, 1);
  assert.deepEqual(
    report.mimicCorrectness.pollutedVariants[0].acceptedVariantItemInternalNames.sort(),
    ['DartPistol', 'LifeDrain']
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
          { itemInternalName: 'DualHook', itemName: 'Dual Hook', sourceRefName: 'Mimics' },
          { itemInternalName: 'MagicDagger', itemName: 'Magic Dagger', sourceRefName: 'Mimics' },
          { itemInternalName: 'PhilosophersStone', itemName: "Philosopher's Stone", sourceRefName: 'Mimics' },
          { itemInternalName: 'TitanGlove', itemName: 'Titan Glove', sourceRefName: 'Mimics' },
          { itemInternalName: 'StarCloak', itemName: 'Star Cloak', sourceRefName: 'Mimics' },
          { itemInternalName: 'CrossNecklace', itemName: 'Cross Necklace', sourceRefName: 'Mimics' },
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
