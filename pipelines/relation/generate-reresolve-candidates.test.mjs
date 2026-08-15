import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildMysqlConnectionOptions,
  buildReresolveCandidateReport,
  parseArgs,
  readPreviousReport,
} from './generate-reresolve-candidates.mjs';

test('parseArgs defaults reresolve candidate generation to read-only report output', () => {
  assert.deepEqual(parseArgs([]), {
    relationDatabase: 'terria_v1_relation',
    generatedAt: null,
    writeReport: true,
    reportPath: null,
  });
});

test('buildMysqlConnectionOptions uses acceptance DB env before local config defaults', () => {
  assert.deepEqual(
    buildMysqlConnectionOptions({
      relationDatabase: 'terria_v1_relation',
      config: {
        database: {
          host: 'config-host',
          port: 13306,
          username: 'config-user',
          password: 'config-pass',
        },
      },
      env: {
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '3307',
        TERRAPEDIA_DB_USERNAME: 'env-user',
        TERRAPEDIA_DB_PASSWORD: 'env-pass',
      },
    }),
    {
      host: '127.0.0.1',
      port: 3307,
      user: 'env-user',
      password: 'env-pass',
      database: 'terria_v1_relation',
    },
  );
});

test('buildReresolveCandidateReport proposes exact npc matches and tracks unresolved trend', () => {
  const report = buildReresolveCandidateReport({
    generatedAt: '2026-05-06T12:00:00Z',
    auditRows: [
      {
        audit_key: 'audit-1',
        audit_status: 'unresolved',
        relation_kind: 'shop',
        source_ref_name: ' Merchant ',
        source_ref_normalized: 'Merchant',
        reason_code: 'npc_source_unresolved',
        evidence_json: JSON.stringify({
          row: { sourcePage: 'Merchant' },
          sourceType: 'shop',
          sourceRefType: 'npc',
        }),
        source_maint_table: 'maint_item_sources',
        source_maint_record_key: 'a'.repeat(64),
        source_provider: 'wiki_gg',
        source_page: 'Merchant',
      },
      {
        audit_key: 'audit-2',
        audit_status: 'unresolved',
        relation_kind: 'loot',
        source_ref_name: 'Unknown NPC',
        source_ref_normalized: 'Unknown NPC',
        reason_code: 'npc_source_unresolved',
        evidence_json: JSON.stringify({
          row: { sourcePage: 'Unknown NPC' },
          sourceType: 'drop',
          sourceRefType: 'npc',
        }),
      },
    ],
    npcRows: [
      {
        source_id: 17,
        internal_name: 'Merchant',
        english_name: 'Merchant',
        source_page: 'Merchant',
        source_provider: 'wiki_gg',
      },
      {
        source_id: 18,
        internal_name: 'Nurse',
        english_name: 'Nurse',
        source_page: 'Nurse',
        source_provider: 'wiki_gg',
      },
    ],
    previousReport: {
      generatedAt: '2026-05-05T12:00:00Z',
      summary: {
        unresolvedAuditCount: 1,
      },
    },
  });

  assert.equal(report.generatedAt, '2026-05-06T12:00:00Z');
  assert.equal(report.summary.unresolvedAuditCount, 2);
  assert.equal(report.summary.candidateCount, 1);
  assert.equal(report.summary.autoMatchedCount, 1);
  assert.equal(report.summary.manualReviewCount, 1);
  assert.equal(report.summary.lowConfidenceCount, 0);
  assert.deepEqual(report.trend, {
    previousUnresolvedAuditCount: 1,
    currentUnresolvedAuditCount: 2,
    delta: 1,
    direction: 'up',
  });
  assert.deepEqual(report.candidates[0], {
    auditId: 'audit-1',
    proposedMatch: {
      npcSourceId: 17,
      npcInternalName: 'Merchant',
      npcName: 'Merchant',
    },
    confidence: 'high',
    evidence: {
      matchBasis: 'source_ref_exact',
      sourceRefName: 'Merchant',
      sourceRefNormalized: 'Merchant',
      reasonCode: 'npc_source_unresolved',
      sourceMaintTable: 'maint_item_sources',
      sourceMaintRecordKey: 'a'.repeat(64),
      sourceProvider: 'wiki_gg',
      sourcePage: 'Merchant',
    },
  });
});

test('buildReresolveCandidateReport keeps low-confidence fuzzy matches separate from manual review', () => {
  const report = buildReresolveCandidateReport({
    generatedAt: '2026-05-06T12:00:00Z',
    auditRows: [
      {
        audit_key: 'audit-low',
        audit_status: 'unresolved',
        relation_kind: 'shop',
        source_ref_name: 'The Merchant',
        source_ref_normalized: 'The Merchant',
        reason_code: 'npc_source_unresolved',
        evidence_json: '{}',
      },
      {
        audit_key: 'audit-manual',
        audit_status: 'unresolved',
        relation_kind: 'shop',
        source_ref_name: 'No Match',
        source_ref_normalized: 'No Match',
        reason_code: 'npc_source_unresolved',
        evidence_json: '{}',
      },
    ],
    npcRows: [
      {
        source_id: 17,
        internal_name: 'Merchant',
        english_name: 'Merchant',
        source_page: 'Merchant',
      },
    ],
    previousReport: null,
  });

  assert.equal(report.summary.unresolvedAuditCount, 2);
  assert.equal(report.summary.candidateCount, 1);
  assert.equal(report.summary.autoMatchedCount, 0);
  assert.equal(report.summary.lowConfidenceCount, 1);
  assert.equal(report.summary.manualReviewCount, 1);
  assert.deepEqual(report.trend, {
    previousUnresolvedAuditCount: null,
    currentUnresolvedAuditCount: 2,
    delta: null,
    direction: 'unknown',
  });
  assert.equal(report.candidates[0].auditId, 'audit-low');
  assert.equal(report.candidates[0].confidence, 'low');
  assert.equal(report.candidates[0].evidence.matchBasis, 'source_ref_fuzzy');
});

test('readPreviousReport ignores same-date output and uses the most recent earlier report', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reresolve-'));
  const reportsDir = path.join(projectRoot, 'reports', 'relation');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, 'reresolve-candidates-2026-05-05.json'),
    JSON.stringify({ summary: { unresolvedAuditCount: 9 } }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportsDir, 'reresolve-candidates-2026-05-06.json'),
    JSON.stringify({ summary: { unresolvedAuditCount: 12 } }),
    'utf8',
  );

  const previousReport = readPreviousReport(projectRoot, '2026-05-06T12:00:00Z');

  assert.deepEqual(previousReport, {
    summary: {
      unresolvedAuditCount: 9,
    },
  });
});

test('readPreviousReport returns null when no earlier dated report exists', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reresolve-'));
  const reportsDir = path.join(projectRoot, 'reports', 'relation');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, 'reresolve-candidates-2026-05-06.json'),
    JSON.stringify({ summary: { unresolvedAuditCount: 12 } }),
    'utf8',
  );

  const previousReport = readPreviousReport(projectRoot, '2026-05-06T12:00:00Z');

  assert.equal(previousReport, null);
});
