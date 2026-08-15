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

test('runMissingMimicVariantLootAudit marks generic Mimics evidence as generic_bucket_only', async () => {
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
      scanArtifacts: async () => ({
        auditStatus: 'warning',
        evidenceHealth: 'partial',
        artifactStatuses: [
          { path: 'reports/normal-npc-loot-restore-dry-run-2026-04-29.json', status: 'present', fileSizeBytes: 123, reason: 'scanned' },
        ],
        scanSummary: {
          scannedFileCount: 1,
          skippedFileCount: 0,
          unreadableFileCount: 0,
          matchedEvidenceFileCount: 1,
        },
        targetEvidence: new Map(),
        coverageAuditPages: 5,
        sourceRefNameMimicsRows: 12,
        npcAuditFilesFound: 5,
        evidencePaths: ['reports/normal-npc-loot-restore-dry-run-2026-04-29.json'],
      }),
    }
  );

  assert.ok(sqlCalls.some((sql) => sql.includes('item_npc_loot_relations')));
  assert.equal(result.report.auditStatus, 'warning');
  assert.equal(result.report.targets.length, 5);
  const present = result.report.targets.find((target) => target.internalName === 'PresentMimic');
  assert.equal(present.candidateStatus, 'generic_bucket_only');
  assert.equal(present.gapReason, 'generic_mimics_bucket_not_variant_materializable');
  assert.equal(present.localState.localLootEntryCount, 0);
  assert.equal(present.relationState.relationFactCandidateCount, 12);
  assert.equal(result.report.scanSummary.scannedFileCount, 1);
  assert.equal(result.report.artifactStatuses[0].status, 'present');
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
      scanArtifacts: async () => ({
        auditStatus: 'pass',
        evidenceHealth: 'sufficient',
        artifactStatuses: [],
        scanSummary: {
          scannedFileCount: 0,
          skippedFileCount: 0,
          unreadableFileCount: 0,
          matchedEvidenceFileCount: 0,
        },
        targetEvidence: new Map(),
        coverageAuditPages: 0,
        sourceRefNameMimicsRows: 0,
        npcAuditFilesFound: 0,
        evidencePaths: [],
      }),
    }
  );

  const mimic = result.report.controls.find((target) => target.internalName === 'Mimic');
  assert.equal(mimic.candidateStatus, 'already_materialized');
  assert.equal(mimic.localState.localLootEntryCount, 7);
  assert.equal(mimic.relationState.projectionLootJsonCount, 7);
});

test('runMissingMimicVariantLootAudit returns blocked report when DB is unavailable', async () => {
  const result = await runMissingMimicVariantLootAudit(
    {
      writeReport: false,
      dateTag: '2026-05-09',
    },
    {
      config: {
        database: {
          host: '127.0.0.1',
          port: 3306,
          username: 'root',
          password: 'root',
        },
      },
      mysqlFactory: {
        createConnection: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        },
      },
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'db_unavailable');
  assert.equal(result.report.summary.targets, 0);
});

test('runMissingMimicVariantLootAudit marks variant-specific evidence as source_found', async () => {
  const connection = {
    query: async () => [[
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
        relationFactCandidateCount: 0,
        projectionLootJsonCount: 0,
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
      scanArtifacts: async () => ({
        auditStatus: 'pass',
        evidenceHealth: 'sufficient',
        artifactStatuses: [
          { path: 'data/wiki-crawler/audit/npc/corrupt-mimic.latest.json', status: 'present', fileSizeBytes: 321, reason: 'variant_specific_match' },
        ],
        scanSummary: {
          scannedFileCount: 1,
          skippedFileCount: 0,
          unreadableFileCount: 0,
          matchedEvidenceFileCount: 1,
        },
        targetEvidence: new Map([
          ['BigMimicCorruption', {
            evidenceHealth: 'sufficient',
            sourceArtifacts: ['data/wiki-crawler/audit/npc/corrupt-mimic.latest.json'],
            candidateDropCount: 4,
            resolvedItemCount: 4,
            unresolvedItemCount: 0,
            hasVariantSpecificEvidence: true,
            hasGenericMimicsEvidence: false,
          }],
        ]),
        coverageAuditPages: 1,
        sourceRefNameMimicsRows: 0,
        npcAuditFilesFound: 1,
        evidencePaths: ['data/wiki-crawler/audit/npc/corrupt-mimic.latest.json'],
      }),
    }
  );

  const corrupt = result.report.targets.find((target) => target.internalName === 'BigMimicCorruption');
  assert.equal(corrupt.candidateStatus, 'source_found');
  assert.equal(corrupt.evidenceHealth, 'sufficient');
  assert.equal(corrupt.candidateDropCount, 4);
  assert.equal(corrupt.resolvedItemCount, 4);
});

test('runMissingMimicVariantLootAudit reports unreadable artifacts without masking readable evidence', async () => {
  const connection = {
    query: async () => [[
      {
        localId: 474,
        gameId: 474,
        internalName: 'BigMimicCrimson',
        name: 'Crimson Mimic',
        localLootJsonCount: 0,
        localLootEntryCount: 0,
        localDerivedByLocalIdCount: 0,
        localDerivedByGameIdCount: 0,
        relationLootCount: 0,
        relationFactCandidateCount: 0,
        projectionLootJsonCount: 0,
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
      scanArtifacts: async () => ({
        auditStatus: 'warning',
        evidenceHealth: 'partial',
        artifactStatuses: [
          { path: 'data/wiki-crawler/output/crimson-mimic.json', status: 'artifact_unreadable', fileSizeBytes: 77, reason: 'json_parse_error', errorCode: 'SyntaxError' },
          { path: 'data/wiki-crawler/audit/npc/crimson-mimic.latest.json', status: 'present', fileSizeBytes: 300, reason: 'variant_specific_match' },
          { path: 'reports/normal-npc-loot-import-2026-04-07.json', status: 'artifact_not_found', fileSizeBytes: 0, reason: 'missing' },
        ],
        scanSummary: {
          scannedFileCount: 2,
          skippedFileCount: 0,
          unreadableFileCount: 1,
          matchedEvidenceFileCount: 1,
        },
        targetEvidence: new Map([
          ['BigMimicCrimson', {
            evidenceHealth: 'partial',
            sourceArtifacts: ['data/wiki-crawler/audit/npc/crimson-mimic.latest.json'],
            candidateDropCount: 2,
            resolvedItemCount: 2,
            unresolvedItemCount: 0,
            hasVariantSpecificEvidence: true,
            hasGenericMimicsEvidence: false,
          }],
        ]),
        coverageAuditPages: 1,
        sourceRefNameMimicsRows: 0,
        npcAuditFilesFound: 1,
        evidencePaths: ['data/wiki-crawler/audit/npc/crimson-mimic.latest.json'],
      }),
    }
  );

  const crimson = result.report.targets.find((target) => target.internalName === 'BigMimicCrimson');
  assert.equal(crimson.candidateStatus, 'source_found');
  assert.equal(result.report.artifactStatuses[0].status, 'artifact_unreadable');
  assert.equal(result.report.scanSummary.unreadableFileCount, 1);
});

test('runMissingMimicVariantLootAudit does not treat standardized name presence as loot source evidence', async () => {
  const connection = {
    query: async () => [[
      {
        localId: 475,
        gameId: 475,
        internalName: 'BigMimicHallow',
        name: 'Hallowed Mimic',
        localLootJsonCount: 0,
        localLootEntryCount: 0,
        localDerivedByLocalIdCount: 0,
        localDerivedByGameIdCount: 0,
        relationLootCount: 0,
        relationFactCandidateCount: 8,
        projectionLootJsonCount: 0,
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
      scanArtifacts: async () => ({
        auditStatus: 'warning',
        evidenceHealth: 'partial',
        artifactStatuses: [
          { path: 'data/standardized/npcs.standardized.json', status: 'present', fileSizeBytes: 1000, reason: 'scanned' },
          { path: 'data/generated/npc-standardized-map.json', status: 'present', fileSizeBytes: 1000, reason: 'scanned' },
        ],
        scanSummary: {
          scannedFileCount: 2,
          skippedFileCount: 0,
          unreadableFileCount: 0,
          matchedEvidenceFileCount: 0,
        },
        targetEvidence: new Map([
          ['BigMimicHallow', {
            evidenceHealth: 'insufficient_artifacts',
            sourceArtifacts: [],
            candidateDropCount: 0,
            resolvedItemCount: 0,
            unresolvedItemCount: 0,
            hasVariantSpecificEvidence: false,
            hasGenericMimicsEvidence: false,
          }],
        ]),
        coverageAuditPages: 0,
        sourceRefNameMimicsRows: 8,
        npcAuditFilesFound: 0,
        evidencePaths: ['data/standardized/npcs.standardized.json', 'data/generated/npc-standardized-map.json'],
      }),
    }
  );

  const hallow = result.report.targets.find((target) => target.internalName === 'BigMimicHallow');
  assert.equal(hallow.candidateStatus, 'generic_bucket_only');
  assert.equal(hallow.candidateDropCount, 0);
  assert.equal(hallow.sourceArtifacts.length, 0);
});
