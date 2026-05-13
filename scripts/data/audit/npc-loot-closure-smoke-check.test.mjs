import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runNpcLootClosureSmokeCheck,
  buildNpcLootClosureSmokeReport,
  parseArgs,
} from './npc-loot-closure-smoke-check.mjs';

function cleanRelationHealthReport() {
  return {
    summary: {
      status: 'warning',
      blockingCount: 0,
      warningCount: 1,
    },
    checks: [
      {
        id: 'open_item_npc_loot_relation_audits',
        status: 'pass',
        rows: [{ count: 0 }],
      },
      {
        id: 'unresolved_item_npc_relation_audits',
        status: 'warn',
        rows: [{ count: 302 }],
      },
    ],
  };
}

test('parseArgs defaults smoke check to read-only report mode', () => {
  assert.deepEqual(parseArgs([]), {
    dateTag: new Date().toISOString().slice(0, 10),
    domainReportPath: null,
    coverageReportPath: null,
    runtimeReportPath: null,
    relationHealthReportPath: null,
    writeReport: true,
    output: null,
  });
});

test('buildNpcLootClosureSmokeReport blocks when domain report still has remaining blockers', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 696,
        unclassifiedZero: 163,
        blockedSourceGap: 349,
        relationGap: 6,
        localGap: 6,
        duplicateSourceIdentity: 28,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {
          source_page_present_with_loot: 250,
          source_page_present_no_loot: 163,
          source_page_missing: 102,
          group_page_present_variant_not_extracted: 247,
        },
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 33,
        byStatus: {
          trusted_direct_loot: 211,
          duplicate_or_polluted: 33,
        },
      },
    },
    relationHealthReport: cleanRelationHealthReport(),
    reportPaths: {
      domainReportPath: 'reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r5.json',
      coverageReportPath: 'reports/audit/npc-source-coverage-inventory-2026-05-11-closure-baseline-r5.json',
      runtimeReportPath: 'reports/audit/npc-loot-runtime-parity-2026-05-11-closure-baseline.json',
    },
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.domainReleaseBlockingCount, 696);
  assert.equal(report.summary.remainingDomainBlockers.length > 0, true);
  assert.equal(report.summary.remainingDomainBlockers.some((entry) => entry.key === 'localGap' && entry.count === 6), true);
  assert.equal(report.summary.remainingDomainBlockers.some((entry) => entry.key === 'duplicateSourceIdentity' && entry.count === 28), true);
  assert.equal(report.blockers.some((entry) => entry.code === 'remaining_domain_blockers'), true);
  assert.equal(report.summary.runtimeBlockingCount, 33);
});

test('buildNpcLootClosureSmokeReport treats reviewed no-direct item loot as closed status', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 0,
        trustedDirectLoot: 1300,
        trustedInheritedLoot: 20,
        expectedZeroLoot: 290,
        reviewedNoDirectItemLoot: 7,
        blockedSourceGap: 0,
        duplicateOrPolluted: 0,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {
          source_page_present_with_loot: 417,
          source_page_present_no_direct_item_loot: 7,
          no_source_required_expected_zero: 290,
        },
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 0,
        byStatus: {
          trusted_direct_loot: 1320,
        },
      },
    },
    relationHealthReport: cleanRelationHealthReport(),
  });

  assert.equal(report.auditStatus, 'pass');
  assert.deepEqual(report.summary.remainingDomainBlockers, []);
  assert.equal(report.summary.coverageCounts.source_page_present_no_direct_item_loot, 7);
  assert.equal(report.blockers.length, 0);
});

test('buildNpcLootClosureSmokeReport treats domain-closed group variants as non-blocking coverage residue', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 0,
        trustedDirectLoot: 303,
        trustedInheritedLoot: 114,
        expectedZeroLoot: 290,
        blockedSourceGap: 0,
        duplicateOrPolluted: 0,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {
          source_page_present_with_loot: 300,
          group_page_present_variant_not_extracted: 113,
          no_source_required_expected_zero: 290,
        },
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 0,
        byStatus: {
          trusted_direct_loot: 417,
        },
      },
    },
    relationHealthReport: cleanRelationHealthReport(),
  });

  assert.equal(report.auditStatus, 'pass');
  assert.deepEqual(report.summary.remainingCoverageBlockers, []);
  assert.equal(report.summary.coverageCounts.group_page_present_variant_not_extracted, 113);
  assert.equal(report.blockers.length, 0);
});

test('buildNpcLootClosureSmokeReport blocks when coverage report still has unextracted source pages', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 0,
        trustedDirectLoot: 1390,
        blockedSourceGap: 0,
        duplicateOrPolluted: 0,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {
          source_page_present_with_loot: 417,
          source_page_present_unextracted: 1,
        },
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 0,
        byStatus: {
          trusted_direct_loot: 1390,
        },
      },
    },
    relationHealthReport: cleanRelationHealthReport(),
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.remainingCoverageBlockers.length, 1);
  assert.deepEqual(report.summary.remainingCoverageBlockers[0], {
    key: 'source_page_present_unextracted',
    count: 1,
  });
  assert.equal(report.blockers.some((entry) => entry.code === 'remaining_coverage_blockers'), true);
});

test('buildNpcLootClosureSmokeReport blocks when relation health report is missing', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 0,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {},
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 0,
      },
    },
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.blockers.some((entry) => entry.code === 'relation_health_report_missing'), true);
});

test('buildNpcLootClosureSmokeReport blocks when relation health lacks open loot check', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 0,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {},
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 0,
      },
    },
    relationHealthReport: {
      summary: {
        status: 'pass',
        blockingCount: 0,
      },
      checks: [],
    },
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.blockers.some((entry) => entry.code === 'relation_health_open_loot_check_missing'), true);
});

test('buildNpcLootClosureSmokeReport blocks when relation health has open loot audits', () => {
  const report = buildNpcLootClosureSmokeReport({
    domainReport: {
      evidenceHealth: 'sufficient',
      summary: {
        releaseBlockingCount: 0,
        trustedDirectLoot: 1540,
      },
    },
    coverageReport: {
      summary: {
        bySourceCoverageStatus: {
          source_page_present_with_loot: 417,
        },
      },
    },
    runtimeReport: {
      summary: {
        blockingCount: 0,
        byStatus: {
          trusted_direct_loot: 1540,
        },
      },
    },
    relationHealthReport: {
      summary: {
        status: 'blocked',
        blockingCount: 1,
        warningCount: 1,
      },
      checks: [
        {
          id: 'open_item_npc_loot_relation_audits',
          status: 'fail',
          rows: [{ count: 1 }],
        },
        {
          id: 'unresolved_item_npc_relation_audits',
          status: 'warn',
          rows: [{ count: 302 }],
        },
      ],
    },
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.openLootAuditCount, 1);
  assert.equal(report.summary.relationHealthStatus, 'blocked');
  assert.equal(report.blockers.some((entry) => entry.code === 'open_loot_relation_audits'), true);
});

test('runNpcLootClosureSmokeCheck reads relation health evidence', async () => {
  const readPaths = [];
  const payloadByPath = new Map([
    ['domain.json', { evidenceHealth: 'sufficient', summary: { releaseBlockingCount: 0 } }],
    ['coverage.json', { summary: { bySourceCoverageStatus: {} } }],
    ['runtime.json', { summary: { blockingCount: 0, byStatus: {} } }],
    ['relation-health.json', cleanRelationHealthReport()],
  ]);

  const { report } = await runNpcLootClosureSmokeCheck({
    domainReportPath: 'domain.json',
    coverageReportPath: 'coverage.json',
    runtimeReportPath: 'runtime.json',
    relationHealthReportPath: 'relation-health.json',
    writeReport: false,
  }, {
    readJson: async (filePath) => {
      readPaths.push(filePath);
      return payloadByPath.get(filePath);
    },
  });

  assert.deepEqual(readPaths, ['domain.json', 'coverage.json', 'runtime.json', 'relation-health.json']);
  assert.equal(report.auditStatus, 'pass');
  assert.equal(report.summary.openLootAuditCount, 0);
});
