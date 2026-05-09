import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  runMissingMimicVariantLootAudit,
} from './audit-missing-mimic-variant-loot.mjs';

test('parseArgs defaults mimic audit to dry stdout-friendly config', () => {
  const actual = parseArgs([]);

  assert.deepEqual(actual, {
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    writeReport: true,
    output: null,
    dateTag: new Date().toISOString().slice(0, 10),
  });
});

test('runMissingMimicVariantLootAudit marks missing variants as blocked when only generic Mimics evidence exists', async () => {
  const sqlCalls = [];
  const connection = {
    query: async (sql) => {
      sqlCalls.push(sql);
      if (sql.includes('FROM `terria_v1_local`.`npcs`')) {
        return [[
          {
            localId: 341,
            gameId: 341,
            internalName: 'PresentMimic',
            name: 'Present Mimic',
            localLootJsonCount: 0,
            localLootEntryCount: 0,
            localDerivedByLocalIdCount: 0,
            localDerivedByGameIdCount: 0,
            relationLootCount: 0,
            relationFactCandidateCount: 12,
            projectionLootJsonCount: 0,
          },
          {
            localId: 473,
            gameId: 473,
            internalName: 'BigMimicCorruption',
            name: 'Corrupt Mimic',
            localLootJsonCount: 0,
            localLootEntryCount: 0,
            localDerivedByLocalIdCount: 0,
            localDerivedByGameIdCount: 0,
            relationLootCount: 0,
            relationFactCandidateCount: 12,
            projectionLootJsonCount: 0,
          },
          {
            localId: 85,
            gameId: 85,
            internalName: 'Mimic',
            name: 'Mimic',
            localLootJsonCount: 7,
            localLootEntryCount: 7,
            localDerivedByLocalIdCount: 7,
            localDerivedByGameIdCount: 7,
            relationLootCount: 7,
            relationFactCandidateCount: 0,
            projectionLootJsonCount: 7,
          },
        ]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    end: async () => {},
  };

  const result = await runMissingMimicVariantLootAudit(
    {
      writeReport: false,
      dateTag: '2026-05-09',
    },
    {
      connection,
    }
  );

  assert.ok(sqlCalls.some((sql) => sql.includes('item_npc_loot_relations')));
  assert.equal(result.report.targets.length, 5);
  const present = result.report.targets.find((target) => target.internalName === 'PresentMimic');
  assert.equal(present.candidateStatus, 'missing_source');
  assert.equal(present.gapReason, 'generic_mimics_bucket_not_variant_materializable');
  assert.equal(present.localState.localLootEntryCount, 0);
  assert.equal(present.relationState.relationFactCandidateCount, 12);
  assert.equal(result.report.summary.blocked, 5);
});

test('runMissingMimicVariantLootAudit preserves already materialized controls', async () => {
  const connection = {
    query: async () => [[
      {
        localId: 85,
        gameId: 85,
        internalName: 'Mimic',
        name: 'Mimic',
        localLootJsonCount: 7,
        localLootEntryCount: 7,
        localDerivedByLocalIdCount: 7,
        localDerivedByGameIdCount: 7,
        relationLootCount: 7,
        relationFactCandidateCount: 0,
        projectionLootJsonCount: 7,
      },
    ]],
    end: async () => {},
  };

  const result = await runMissingMimicVariantLootAudit(
    {
      writeReport: false,
      dateTag: '2026-05-09',
    },
    {
      connection,
    }
  );

  const mimic = result.report.controls.find((target) => target.internalName === 'Mimic');
  assert.equal(mimic.candidateStatus, 'already_materialized');
  assert.equal(mimic.localState.localLootEntryCount, 7);
  assert.equal(mimic.relationState.projectionLootJsonCount, 7);
});
