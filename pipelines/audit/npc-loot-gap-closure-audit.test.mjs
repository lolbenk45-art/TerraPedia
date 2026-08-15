import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyNpcLootGap,
  parseArgs,
  runNpcLootGapClosureAudit,
} from './npc-loot-gap-closure-audit.mjs';

test('parseArgs defaults to read-only report generation', () => {
  assert.deepEqual(parseArgs([]), {
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
    writeReport: true,
    output: null,
    dateTag: new Date().toISOString().slice(0, 10),
  });
});

test('classifyNpcLootGap marks generic Mimics evidence as generic_bucket', () => {
  const actual = classifyNpcLootGap({
    sourceRefName: 'Mimics',
    targetNpcInternalName: 'BigMimicCorruption',
    candidateNpcInternalNames: ['PresentMimic', 'BigMimicCorruption'],
    auditStatus: 'ambiguous',
    reasonCode: 'npc_source_ambiguous',
  });

  assert.equal(actual.classification, 'generic_bucket');
  assert.equal(actual.materializable, false);
});

test('classifyNpcLootGap marks generic Mimics audit rows as generic_bucket without a target', () => {
  const actual = classifyNpcLootGap({
    sourceRefName: 'Mimics',
    auditStatus: 'unresolved',
    reasonCode: 'npc_source_unresolved',
  });

  assert.equal(actual.classification, 'generic_bucket');
  assert.equal(actual.materializable, false);
});

test('classifyNpcLootGap accepts representative-safe positive ID fallback', () => {
  const actual = classifyNpcLootGap({
    sourceRefName: 'Blood Eel',
    raw: {
      sourceRefInternalName: 'BloodEelHead',
      sourceRefResolution: 'positive_id_fallback',
    },
    candidateNpcInternalNames: ['BloodEelHead', 'BloodEelBody', 'BloodEelTail'],
    auditStatus: 'ambiguous',
    reasonCode: 'npc_source_ambiguous',
  });

  assert.equal(actual.classification, 'positive_id_fallback_resolvable');
  assert.equal(actual.materializable, true);
  assert.equal(actual.resolvedNpcInternalName, 'BloodEelHead');
});

test('classifyNpcLootGap preserves biome or tier variants as true_ambiguous', () => {
  const pigron = classifyNpcLootGap({
    sourceRefName: 'Pigron',
    raw: {
      sourceRefInternalName: 'PigronCorruption',
      sourceRefResolution: 'positive_id_fallback',
    },
    candidateNpcInternalNames: ['PigronCorruption', 'PigronCrimson', 'PigronHallow'],
    auditStatus: 'ambiguous',
    reasonCode: 'npc_source_ambiguous',
  });
  const darkMage = classifyNpcLootGap({
    sourceRefName: 'Dark Mage',
    raw: {
      sourceRefInternalName: 'DD2DarkMageT1',
      sourceRefResolution: 'positive_id_fallback',
    },
    candidateNpcInternalNames: ['DD2DarkMageT1', 'DD2DarkMageT3'],
    auditStatus: 'ambiguous',
    reasonCode: 'npc_source_ambiguous',
  });

  assert.equal(pigron.classification, 'true_ambiguous');
  assert.equal(pigron.materializable, false);
  assert.equal(darkMage.classification, 'true_ambiguous');
  assert.equal(darkMage.materializable, false);
});

test('classifyNpcLootGap separates non-NPC source rows', () => {
  for (const sourceRefName of [
    'Gold Chest',
    'Azure Crate',
    'Treasure Bag (Moon Lord)',
    'Shaking',
    'tree',
    'Ash tree',
    'Forest tree',
    'Golden Lock Box',
    'Bonus drop',
    'Expert Mode',
    'Geode',
    'Crimson Heart',
    'Shadow Orb',
    'Goodie Bag',
    'Can Of Worms',
    'Pigronata',
    'Shadow Hammer',
    'Present',
    'Herb Bag',
  ]) {
    const actual = classifyNpcLootGap({
      sourceRefName,
      auditStatus: 'unresolved',
      reasonCode: 'npc_source_unresolved',
    });
    assert.equal(actual.classification, 'non_npc_source_misclassified', sourceRefName);
    assert.equal(actual.materializable, false);
  }
});

test('classifyNpcLootGap separates generic plural or group source buckets', () => {
  for (const sourceRefName of ['Mummies', 'Ghouls', 'Jellyfish', 'Sand Sharks', 'Slimes', 'The Twins', 'Celestial Pillars']) {
    const actual = classifyNpcLootGap({
      sourceRefName,
      auditStatus: 'unresolved',
      reasonCode: 'npc_source_unresolved',
    });

    assert.equal(actual.classification, 'generic_bucket', sourceRefName);
    assert.equal(actual.materializable, false);
  }
});

test('runNpcLootGapClosureAudit returns blocked report when DB is unavailable', async () => {
  const result = await runNpcLootGapClosureAudit(
    { writeReport: false, dateTag: '2026-05-09' },
    {
      config: { database: { host: '127.0.0.1', port: 3306, username: 'root', password: 'root' } },
      mysqlFactory: {
        createConnection: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        },
      },
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'db_unavailable');
  assert.equal(result.report.summary.totalGaps, 0);
});

test('runNpcLootGapClosureAudit classifies fixture rows and exposes count families', async () => {
  const sqlCalls = [];
  const connection = {
    query: async (sql) => {
      sqlCalls.push(sql);
      if (sql.includes('FROM `terria_v1_relation`.`item_npc_relation_audits`')) {
        return [[
          {
            auditKey: 'a1',
            relationKind: 'loot',
            auditStatus: 'ambiguous',
            reasonCode: 'npc_source_ambiguous',
            itemInternalName: 'BloodMoonMonolith',
            itemName: 'Blood Moon Monolith',
            sourceRefName: 'Blood Eel',
            sourceRefNormalized: 'Blood Eel',
            candidateNpcInternalName: 'BloodEelHead',
            evidenceJson: JSON.stringify({
              sourceRefResolution: 'ambiguous',
              candidateNpcInternalNames: ['BloodEelHead', 'BloodEelBody', 'BloodEelTail'],
              raw: {
                sourceRefInternalName: 'BloodEelHead',
                sourceRefResolution: 'positive_id_fallback',
              },
            }),
            rowCount: 1,
          },
          {
            auditKey: 'a2',
            relationKind: 'loot',
            auditStatus: 'ambiguous',
            reasonCode: 'npc_source_ambiguous',
            itemInternalName: 'PigronMinecart',
            itemName: 'Pigron Minecart',
            sourceRefName: 'Pigron',
            sourceRefNormalized: 'Pigron',
            candidateNpcInternalName: 'PigronCorruption',
            evidenceJson: JSON.stringify({
              candidateNpcInternalNames: ['PigronCorruption', 'PigronCrimson', 'PigronHallow'],
              raw: {
                sourceRefInternalName: 'PigronCorruption',
                sourceRefResolution: 'positive_id_fallback',
              },
            }),
            rowCount: 1,
          },
          {
            auditKey: 'a3',
            relationKind: 'loot',
            auditStatus: 'unresolved',
            reasonCode: 'npc_source_unresolved',
            itemInternalName: 'GoldCoin',
            itemName: 'Gold Coin',
            sourceRefName: 'Gold Chest',
            sourceRefNormalized: 'Gold Chest',
            candidateNpcInternalName: null,
            evidenceJson: '{}',
            rowCount: 1,
          },
        ]];
      }
      if (sql.includes('FROM `terria_v1_local`.`npcs`')) {
        return [[
          {
            internalName: 'BigMimicCorruption',
            localLootCount: 0,
            relationLootCount: 0,
            projectionLootCount: 0,
          },
        ]];
      }
      if (sql.includes('COUNT(*) AS count')) {
        return [[{ count: 0 }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    end: async () => {},
  };

  const result = await runNpcLootGapClosureAudit(
    { writeReport: false, dateTag: '2026-05-09' },
    { connection }
  );

  assert.ok(sqlCalls.every((sql) => /^\s*SELECT/i.test(sql)));
  assert.equal(result.report.auditStatus, 'pass');
  assert.equal(result.report.evidenceHealth, 'sufficient');
  assert.equal(result.report.summary.totalGaps, 4);
  assert.equal(result.report.summary.byClassification.positive_id_fallback_resolvable, 1);
  assert.equal(result.report.summary.byClassification.true_ambiguous, 1);
  assert.equal(result.report.summary.byClassification.non_npc_source_misclassified, 1);
  assert.equal(result.report.summary.byClassification.generic_bucket, 1);
  assert.equal(result.report.gaps.find((gap) => gap.auditKey === 'a1').resolvedNpcInternalName, 'BloodEelHead');
  assert.equal(result.report.gaps.find((gap) => gap.auditKey === 'mimic:BigMimicCorruption').classification, 'generic_bucket');
});
