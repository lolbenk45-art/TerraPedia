import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcLootClosureSmokeReport,
  parseArgs,
} from './npc-loot-closure-smoke-check.mjs';

test('parseArgs defaults smoke check to read-only report mode', () => {
  assert.deepEqual(parseArgs([]), {
    dateTag: new Date().toISOString().slice(0, 10),
    domainReportPath: null,
    coverageReportPath: null,
    runtimeReportPath: null,
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
  });

  assert.equal(report.auditStatus, 'blocked');
  assert.equal(report.summary.remainingCoverageBlockers.length, 1);
  assert.deepEqual(report.summary.remainingCoverageBlockers[0], {
    key: 'source_page_present_unextracted',
    count: 1,
  });
  assert.equal(report.blockers.some((entry) => entry.code === 'remaining_coverage_blockers'), true);
});
