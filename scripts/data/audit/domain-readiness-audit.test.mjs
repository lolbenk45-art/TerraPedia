import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  buildDomainReadinessReport,
  resolveDomainReportPath,
} from './domain-readiness-audit.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';

const execFileAsync = promisify(execFile);

test('buildDomainReadinessReport returns pass when source evidence files are present and readable', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 1,
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff', imageUrl: 'https://example.test/well-fed.png' },
    ],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 1,
    records: { WellFed: { id: 1 } },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(report.domainId, 'buffs');
  assert.equal(report.panelId, 'sourceReadiness');
  assert.equal(report.status, 'pass');
  assert.equal(report.requiresDatabase, false);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.summary.requiredEvidenceCount, 1);
  assert.equal(report.summary.optionalEvidenceCount, 1);
  assert.equal(report.summary.presentEvidenceCount, 2);
  assert.deepEqual(report.blockingReasons, []);
  assert.deepEqual(report.warningReasons, []);
  assert.equal(report.checks[0].recordCount, 1);
});

test('buildDomainReadinessReport accepts scoped legacy buff name gaps', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 2,
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' },
      { id: 138, internalName: 'MinecartLegacyUnused', englishName: null, type: 'buff' },
    ],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 2,
    records: {
      WellFed: { id: 1 },
      MinecartLegacyUnused: { id: 138 },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.summary.blockedCount, 0);
  assert.deepEqual(report.warningReasons, []);
});

test('buildDomainReadinessReport does not allow unlisted legacy buff required-field gaps', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 2,
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' },
      { id: 999, internalName: 'FutureLegacyUnused', englishName: null, type: 'buff' },
    ],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 2,
    records: {
      WellFed: { id: 1 },
      FutureLegacyUnused: { id: 999 },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => reason.includes('1 buff records missing required fields')));
});

test('buildDomainReadinessReport blocks source evidence when totalRecords is missing', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' },
    ],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 1,
    records: { WellFed: { id: 1 } },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /totalRecords is missing or zero/.test(reason)));
});

test('buildDomainReadinessReport blocks missing required source evidence but only warns for optional evidence', () => {
  const repoRoot = createTempRepo();

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'projectiles',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.summary.missingEvidenceCount, 2);
  assert.deepEqual(report.blockingReasons, [
    'Missing required evidence: data/standardized/projectiles.standardized.json',
  ]);
  assert.deepEqual(report.warningReasons, [
    'Missing optional evidence: data/standardized-view/projectiles/_meta.json',
  ]);
});

test('buildDomainReadinessReport blocks product public readiness when public controller evidence is absent', () => {
  const repoRoot = createTempRepo();

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'public',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.includes('Missing required evidence: back/src/main/java/com/terraria/skills/controller/PublicArmorSetController.java'));
  assert.ok(report.blockingReasons.includes('Missing required evidence: back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java'));
  assert.ok(report.warningReasons.includes('Missing optional evidence: front-nuxt/pages/armor-sets/index.vue'));
  assert.ok(report.warningReasons.includes('Missing optional evidence: front-nuxt/pages'));
});

test('buildDomainReadinessReport passes public readiness for buffs with public controller evidence', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/PublicBuffController.java', '@RequestMapping("/public/buffs")\nclass PublicBuffController {}');
  writeText(repoRoot, 'back/src/test/java/com/terraria/skills/controller/PublicBuffControllerTest.java', 'class PublicBuffControllerTest {}');
  writeText(repoRoot, 'front-nuxt/pages/buffs/index.vue', '<template />');
  fs.mkdirSync(path.join(repoRoot, 'front-nuxt/pages'), { recursive: true });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'public',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
});

test('buildDomainReadinessReport passes public readiness for projectiles with public controller evidence', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/PublicProjectileController.java', '@RequestMapping("/public/projectiles")\nclass PublicProjectileController {}');
  writeText(repoRoot, 'back/src/test/java/com/terraria/skills/controller/PublicProjectileControllerTest.java', 'class PublicProjectileControllerTest {}');
  writeText(repoRoot, 'front-nuxt/pages/projectiles/index.vue', '<template />');
  fs.mkdirSync(path.join(repoRoot, 'front-nuxt/pages'), { recursive: true });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'projectiles',
    panel: 'public',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
});

test('buildDomainReadinessReport passes public readiness for armor sets with public controller evidence', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/PublicArmorSetController.java', '@RequestMapping("/public/armor-sets")\nclass PublicArmorSetController {}');
  writeText(repoRoot, 'back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java', 'class PublicArmorSetControllerTest {}');
  writeText(repoRoot, 'front-nuxt/pages/armor-sets/index.vue', '<template />');
  fs.mkdirSync(path.join(repoRoot, 'front-nuxt/pages'), { recursive: true });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'public',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
});

test('buildDomainReadinessReport applies boss source semantic gates', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-bosses.latest.json', {
    overview: { bossCount: 2 },
    records: [
      {
        status: 'ok',
        titleEn: 'King Slime',
        pageTitleEn: 'King Slime',
        sourceUrl: 'https://example.test/King_Slime',
        titleZh: '史莱姆王',
        imageUrl: 'https://example.test/king-slime.png',
      },
      {
        status: 'ok',
        titleEn: 'Eye of Cthulhu',
        pageTitleEn: 'Eye of Cthulhu',
        sourceUrl: 'https://example.test/Eye_of_Cthulhu',
      },
    ],
  });
  writeJson(repoRoot, 'reports/wiki-bosses-fetch-2026-04-21.json', { ok: true });
  writeJson(repoRoot, 'reports/wiki-bosses-import-2026-04-21.json', {
    generatedAt: '2026-04-21T00:00:00Z',
    dryRun: false,
    totalBosses: 2,
    createdBossGroups: 2,
    updatedBossGroups: 0,
    mappedBosses: 2,
    unmappedBosses: 0,
    unresolvedBosses: [],
    remainingWikiBossImages: 0,
    remainingWikiBossMemberImages: 0,
    bossMemberImageMissingSource: 0,
    failedBossImages: 0,
    failedBossMemberImages: 0,
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'bosses',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.summary.blockedCount, 0);
  assert.equal(report.summary.warningCount, 1);
  assert.match(report.warningReasons[0], /missing optional localized or image fields/);
});

test('buildDomainReadinessReport blocks boss source count and required field drift', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-bosses.latest.json', {
    overview: { bossCount: 2 },
    records: [
      { status: 'ok', titleEn: 'King Slime', pageTitleEn: 'King Slime', sourceUrl: 'https://example.test/King_Slime' },
      { status: 'missing', titleEn: 'Broken Boss', pageTitleEn: '', sourceUrl: '' },
      { status: 'ok', titleEn: '', pageTitleEn: 'No Title', sourceUrl: 'https://example.test/No_Title' },
    ],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'bosses',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /overview.bossCount=2 does not match records.length=3/);
  assert.match(report.blockingReasons[0], /2 boss records missing required source fields/);
  assert.match(report.blockingReasons[0], /1 boss records have non-ok status/);
});

test('buildDomainReadinessReport uses boss image lineage coverage instead of npc map fallback', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/audit/image-source-lineage-2026-05-07.json', {
    summary: {
      totalEntityTypes: 6,
      readyEntityTypes: 2,
      notReadyEntityTypes: 4,
    },
    entities: {
      bosses: {
        contractReady: true,
        gapReasons: [],
        lineage: {
          core: { rowCount: 1, rowsWithImage: 1 },
          maint: { rowCount: 1, rowsWithStructuredImage: 1 },
          relation: { rowCount: 1, rowsWithStructuredImage: 1 },
          projection: { rowCount: 1, rowsWithImage: 1, rowsWithManagedImage: 1 },
        },
      },
    },
  });
  writeText(repoRoot, 'docs/contracts/image-source-contract.md', [
    '# Image Source Contract',
    '',
    '| Entity | Core field | Maint lineage table | Relation lineage table | Projection field |',
    '| --- | --- | --- | --- | --- |',
    '| Boss | `boss_groups.image_url` | `maint_bosses.image_url` | `relation_bosses.image_url` | `projection_bosses.image_url` |',
  ].join('\n'));

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'bosses',
    panel: 'image',
    generatedAt: '2026-05-07T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.blockingReasons, []);
  assert.deepEqual(report.warningReasons, []);
  assert.equal(
    report.checks.find((check) => check.id === 'reports_audit_image_source_lineagelatest_json')?.latestReportPath,
    'reports/audit/image-source-lineage-2026-05-07.json',
  );
});

test('buildDomainReadinessReport warns when boss image lineage report is present but not contract ready', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/audit/image-source-lineage-2026-05-07.json', {
    summary: {
      totalEntityTypes: 6,
      readyEntityTypes: 1,
      notReadyEntityTypes: 5,
    },
    entities: {
      bosses: {
        contractReady: false,
        gapReasons: ['projection_image_not_managed', 'missing_projection_rows'],
        lineage: {
          core: { rowCount: 1, rowsWithImage: 1 },
          maint: { rowCount: 1, rowsWithStructuredImage: 1 },
          relation: { rowCount: 1, rowsWithStructuredImage: 1 },
          projection: { rowCount: 0, rowsWithImage: 0, rowsWithManagedImage: 0 },
        },
      },
    },
  });
  writeText(repoRoot, 'docs/contracts/image-source-contract.md', [
    '# Image Source Contract',
    '',
    '| Entity | Core field | Maint lineage table | Relation lineage table | Projection field |',
    '| --- | --- | --- | --- | --- |',
    '| Boss | `boss_groups.image_url` | `maint_bosses.image_url` | `relation_bosses.image_url` | `projection_bosses.image_url` |',
  ].join('\n'));

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'bosses',
    panel: 'image',
    generatedAt: '2026-05-07T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /projection_image_not_managed/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /missing_projection_rows/.test(reason)));
});

test('buildDomainReadinessReport does not treat admin boss files as sufficient public readiness evidence', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/AdminBossController.java', 'class AdminBossController {}');
  writeText(repoRoot, 'scripts/data/relation/projection-schema.mjs', [
    'export const PROJECTION_TABLE_NAMES = ["projection_items"];',
    'export function buildProjectionSchemaStatements() {',
    '  return ["CREATE TABLE projection_items (id BIGINT)"];',
    '}',
  ].join('\n'));
  writeText(repoRoot, 'scripts/data/relation/projection-sync.mjs', [
    'export function buildProjectionPayload() {',
    '  return { projectionItems: [] };',
    '}',
  ].join('\n'));

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'bosses',
    panel: 'public',
    generatedAt: '2026-05-07T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /projection_bosses/.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /PublicBossController/.test(reason)));
});

test('buildDomainReadinessReport passes boss public readiness when the public controller and projection evidence are explicit', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/PublicBossController.java', [
    '@RequestMapping("/public/bosses")',
    'class PublicBossController {}',
  ].join('\n'));
  writeText(repoRoot, 'back/src/test/java/com/terraria/skills/controller/PublicBossControllerTest.java', [
    'class PublicBossControllerTest {',
    '  // route contract: /public/bosses',
    '}',
  ].join('\n'));
  writeText(repoRoot, 'scripts/data/relation/projection-schema.mjs', [
    'export const PROJECTION_TABLE_NAMES = ["projection_bosses"];',
    'export function buildProjectionSchemaStatements() {',
    '  return [',
    '    "CREATE TABLE projection_bosses (code VARCHAR(255), image_url VARCHAR(500), member_npcs_json LONGTEXT, loot_items_json LONGTEXT, effects_json LONGTEXT)"',
    '  ];',
    '}',
  ].join('\n'));
  writeText(repoRoot, 'scripts/data/relation/projection-sync.mjs', [
    'export function buildProjectionPayload({ relationBosses = [], bossItemRewardRelations = [], bossEffectRelations = [] } = {}) {',
    '  return {',
    '    projectionBosses: relationBosses.map((row) => ({',
    '      code: row.code ?? null,',
    '      lootItemsJson: JSON.stringify(bossItemRewardRelations),',
    '      effectsJson: JSON.stringify(bossEffectRelations),',
    '    })),',
    '  };',
    '}',
  ].join('\n'));

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'bosses',
    panel: 'public',
    generatedAt: '2026-05-07T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.blockingReasons, []);
  assert.deepEqual(report.warningReasons, []);
});

test('buildDomainReadinessReport applies buff source semantic gates', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 2,
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' },
      { id: 2, internalName: 'Tipsy', englishName: 'Tipsy', type: 'buff' },
    ],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 2,
    records: {
      WellFed: { id: 1 },
      Tipsy: { id: 2 },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.summary.blockedCount, 0);
  assert.equal(report.summary.warningCount, 0);
});

test('buildDomainReadinessReport blocks buff source count and required field drift', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 2,
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' },
      { id: 2, internalName: '', englishName: 'Broken', type: '' },
      { id: null, internalName: 'NoId', englishName: '', type: 'buff' },
    ],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 1,
    records: {
      WellFed: { id: 1 },
      Tipsy: { id: 2 },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => reason.includes('totalRecords=2 does not match records.length=3')));
  assert.ok(report.blockingReasons.some((reason) => reason.includes('map count=1 does not match records size=2')));
});

test('buildDomainReadinessReport applies relation coverage semantic gates for buffs and projectiles', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/entity-coverage-baseline-2026-04-28.json', {
    domains: {
      buffs: { localTotal: 388, maintTotal: 388, relationTotal: 388 },
      projectiles: { localTotal: 1111, maintTotal: 1111, relationTotal: 1111 },
    },
    fieldAudit: {
      domains: {
        buffs: { fields: { nameZh: { gap: 0 }, image: { gap: 0 }, tooltipZh: { gap: 0 } } },
        projectiles: { fields: { nameZh: { gap: 0 }, image: { gap: 0 } } },
      },
    },
  });

  const buffs = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'relation',
    generatedAt: '2026-05-03T12:00:00Z',
  });
  const projectiles = buildDomainReadinessReport({
    repoRoot,
    domainId: 'projectiles',
    panel: 'relation',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(buffs.status, 'pass');
  assert.equal(buffs.summary.blockedCount, 0);
  assert.equal(projectiles.status, 'warning');
  assert.equal(projectiles.summary.blockedCount, 0);
  assert.ok(projectiles.warningReasons.includes('Missing optional evidence: reports/projectile-zh-image-backfill*.json'));
});

test('buildDomainReadinessReport blocks unresolved audit trend when unresolved count is rising', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/reresolve-candidates-2026-05-06.json', {
    generatedAt: '2026-05-06T12:00:00Z',
    summary: {
      unresolvedAuditCount: 2602,
      candidateCount: 1401,
      autoMatchedCount: 1200,
      manualReviewCount: 1201,
      lowConfidenceCount: 201,
    },
    trend: {
      previousUnresolvedAuditCount: 2500,
      currentUnresolvedAuditCount: 2602,
      delta: 102,
      direction: 'up',
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'unresolved-audit-trend',
    generatedAt: '2026-05-06T12:30:00Z',
  });

  assert.equal(report.panelId, 'unresolvedAuditTrend');
  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /unresolved audit trend is rising/i.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /delta=102/i.test(reason)));
});

test('buildDomainReadinessReport warns unresolved audit trend when no historical baseline is available', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/reresolve-candidates-2026-05-06.json', {
    generatedAt: '2026-05-06T12:00:00Z',
    summary: {
      unresolvedAuditCount: 2602,
      candidateCount: 1401,
      autoMatchedCount: 1200,
      manualReviewCount: 1201,
      lowConfidenceCount: 201,
    },
    trend: {
      previousUnresolvedAuditCount: null,
      currentUnresolvedAuditCount: 2602,
      delta: null,
      direction: 'unknown',
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'unresolved-audit-trend',
    generatedAt: '2026-05-06T12:30:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /historical baseline is unavailable/i.test(reason)));
});

test('buildDomainReadinessReport blocks relation coverage totals and gaps', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/entity-coverage-baseline-2026-04-28.json', {
    domains: {
      buffs: { localTotal: 388, maintTotal: 387, relationTotal: 388 },
    },
    fieldAudit: {
      domains: {
        buffs: { fields: { nameZh: { gap: 1 }, image: { gap: 0 }, tooltipZh: { gap: 2 } } },
      },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'relation',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons.find((reason) => reason.includes('coverage totals')), /local=388, maint=387, relation=388/);
  assert.match(report.blockingReasons.find((reason) => reason.includes('field gaps')), /nameZh.gap=1/);
  assert.match(report.blockingReasons.find((reason) => reason.includes('field gaps')), /tooltipZh.gap=2/);
});

test('buildDomainReadinessReport applies projectile source and image semantic gates', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/projectiles.standardized.json', {
    totalRecords: 3,
    records: [
      { id: 0, internalName: 'None', name: null },
      { id: 1, internalName: 'WoodenArrowFriendly', name: 'Wooden Arrow', imageUrl: 'https://example.test/wooden-arrow.png' },
      { id: 2, internalName: 'FireArrow', name: 'Flaming Arrow', extras: { image: 'Fire Arrow.png' } },
    ],
  });
  writeJson(repoRoot, 'data/standardized-view/projectiles/_meta.json', { totalRecords: 3 });
  writeJson(repoRoot, 'reports/relation/entity-coverage-baseline-2026-04-28.json', {
    domains: {
      projectiles: { localTotal: 3, maintTotal: 3, relationTotal: 3 },
    },
    fieldAudit: {
      domains: {
        projectiles: { fields: { nameZh: { gap: 0 }, image: { gap: 0 } } },
      },
    },
  });
  writeJson(repoRoot, 'reports/projectile-zh-image-backfill-2026-04-22.json', {
    generatedAt: '2026-04-22T00:00:00Z',
    apply: true,
    sourceMapCount: 2,
    total: 2,
    totalAvailable: 2,
    imageResolved: 2,
    unresolvedImage: 0,
    unresolvedZh: 1,
  });
  writeJson(repoRoot, 'data/generated/projectile-zh-map.json', {
    count: 1,
    records: { WoodenArrowFriendly: { nameZh: '木箭' } },
  });

  const source = buildDomainReadinessReport({
    repoRoot,
    domainId: 'projectiles',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });
  const relation = buildDomainReadinessReport({
    repoRoot,
    domainId: 'projectiles',
    panel: 'relation',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(source.status, 'pass');
  assert.equal(relation.status, 'pass');
  assert.ok(relation.checks.some((check) => /unresolvedZh=1/.test(check.message)));
});

test('buildDomainReadinessReport warns when projectile unresolved zh exceeds baseline', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/projectiles.standardized.json', {
    totalRecords: 1,
    records: [
      { id: 1, internalName: 'WoodenArrowFriendly', name: 'Wooden Arrow', imageUrl: 'https://example.test/wooden-arrow.png' },
    ],
  });
  writeJson(repoRoot, 'reports/relation/entity-coverage-baseline-2026-04-28.json', {
    domains: {
      projectiles: { localTotal: 1, maintTotal: 1, relationTotal: 1 },
    },
    fieldAudit: {
      domains: {
        projectiles: { fields: { nameZh: { gap: 0 }, image: { gap: 0 } } },
      },
    },
  });
  writeJson(repoRoot, 'reports/projectile-zh-image-backfill-2026-04-22.json', {
    generatedAt: '2026-04-22T00:00:00Z',
    apply: true,
    sourceMapCount: 1,
    total: 1,
    totalAvailable: 1,
    imageResolved: 1,
    unresolvedImage: 0,
    unresolvedZh: 106,
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'projectiles',
    panel: 'relation',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /unresolvedZh=106 exceeds baseline 105/.test(reason)));
});

test('buildDomainReadinessReport applies armor set source and image semantic gates', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-armor-sets.latest.json', {
    total: 2,
    records: [
      { entityType: 'armor_set', compositionKind: 'fixed', nameEn: 'Copper armor', nameZh: '铜盔甲', images: ['a.png'] },
      { entityType: 'armor_set', compositionKind: 'fixed', nameEn: 'Tin armor', nameZh: '锡盔甲', images: ['b.png'] },
    ],
  });
  writeJson(repoRoot, 'data/standardized/armor_sets.standardized.json', {
    totalRecords: 1,
    records: [
      { textKey: 'CopperArmor', benefitExpression: '2 defense', uniqueItemIds: [1, 2, 3], sets: [{ parts: [1, 2, 3] }], setCount: 1 },
    ],
  });
  writeJson(repoRoot, 'data/generated/armor-set-definition-map.json', {
    total: 2,
    mapped: 1,
    placeholder: 1,
    records: {
      1: {
        armorSetId: 1,
        name: 'Copper armor',
        status: 'mapped',
        definition: { textKey: 'ArmorSetBonus.Copper', uniqueItemIds: [1, 2, 3] },
      },
      999: {
        armorSetId: 999,
        name: 'Unknown armor',
        internalCode: 'Unknown armor',
        itemIds: [999],
        status: 'expected_placeholder',
        review: {
          status: 'accepted_expected_placeholder',
          reason: 'nonstandard single-piece equipped display',
        },
        definition: {
          textKey: null,
          textZh: 'Unknown armor',
          uniqueItemIds: [999],
        },
      },
    },
  });
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    totalArmorSets: 1,
    totalArmorSetImages: 3,
    warningCount: 1,
    samples: [
      {
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: null,
        contentType: 'image/png',
      },
    ],
  });
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', { records: [{ image: 'a.png' }] });

  const source = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });
  const image = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(source.status, 'warning');
  assert.match(source.warningReasons.find((reason) => reason.includes('definition map')), /mapped=1\/2/);
  assert.match(source.warningReasons.find((reason) => reason.includes('definition map')), /unaccepted placeholders=1/);
  assert.equal(image.status, 'pass');
  assert.ok(image.checks.some((check) => /wiki original fallback/.test(check.message)));
});

test('buildDomainReadinessReport accepts armor image readiness without legacy fetch report when parsed snapshot exists', () => {
  const repoRoot = createTempRepo();
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', {
    totalArmorSets: 1,
    totalArmorSetImages: 1,
    armorSetImages: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
    ],
    warnings: [],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.ok(!report.warningReasons.some((reason) => /reports\/fetch\/fetch-armor-set-images\*\.json/.test(reason)));
});

test('buildDomainReadinessReport accepts audited armor definition placeholder exceptions', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-armor-sets.latest.json', {
    total: 1,
    records: [
      { entityType: 'armor_set', compositionKind: 'nonstandard_piece_set', nameEn: 'Empty Bucket', nameZh: '空桶', images: ['a.png'] },
    ],
  });
  writeJson(repoRoot, 'data/standardized/armor_sets.standardized.json', {
    totalRecords: 1,
    records: [
      { textKey: 'ArmorSetBonus.Wood', benefitExpression: 'Wood bonus', uniqueItemIds: [1, 2, 3], sets: [[1, 2, 3]], setCount: 1 },
    ],
  });
  writeJson(repoRoot, 'data/generated/armor-set-definition-map.json', {
    total: 2,
    mapped: 1,
    placeholder: 1,
    records: {
      1: {
        armorSetId: 1,
        name: 'Mapped armor',
        status: 'mapped',
        definition: { textKey: 'ArmorSetBonus.Wood', uniqueItemIds: [1, 2, 3] },
      },
      313: {
        armorSetId: 313,
        name: '空桶',
        internalCode: '空桶',
        itemIds: [205],
        status: 'expected_placeholder',
        review: {
          status: 'accepted_expected_placeholder',
          reason: 'nonstandard single-piece equipped display',
        },
        definition: {
          textKey: null,
          textZh: '空桶',
          uniqueItemIds: [205],
        },
      },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.ok(report.checks.some((check) => /accepted placeholder exceptions=1/.test(check.message)));
});

test('buildDomainReadinessReport warns when armor definition map totals drift', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-armor-sets.latest.json', {
    total: 1,
    records: [
      { entityType: 'armor_set', compositionKind: 'nonstandard_piece_set', nameEn: 'Empty Bucket', nameZh: '空桶', images: ['a.png'] },
    ],
  });
  writeJson(repoRoot, 'data/generated/armor-set-definition-map.json', {
    total: 3,
    mapped: 1,
    placeholder: 1,
    records: {
      1: {
        armorSetId: 1,
        name: 'Mapped armor',
        status: 'mapped',
        definition: { textKey: 'ArmorSetBonus.Wood', uniqueItemIds: [1, 2, 3] },
      },
      313: {
        armorSetId: 313,
        name: '空桶',
        itemIds: [205],
        status: 'placeholder',
        definition: { textKey: null, uniqueItemIds: [205] },
      },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /mapped \+ placeholder=2 does not match total=3/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /records=2 does not match total=3/.test(reason)));
});

test('buildDomainReadinessReport rejects audited armor placeholder exception with mismatched item ids', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-armor-sets.latest.json', {
    total: 1,
    records: [
      { entityType: 'armor_set', compositionKind: 'nonstandard_piece_set', nameEn: 'Empty Bucket', nameZh: '空桶', images: ['a.png'] },
    ],
  });
  writeJson(repoRoot, 'data/standardized/armor_sets.standardized.json', {
    totalRecords: 1,
    records: [
      { textKey: 'ArmorSetBonus.Wood', benefitExpression: 'Wood bonus', uniqueItemIds: [1, 2, 3], sets: [[1, 2, 3]], setCount: 1 },
    ],
  });
  writeJson(repoRoot, 'data/generated/armor-set-definition-map.json', {
    total: 2,
    mapped: 1,
    placeholder: 1,
    records: {
      1: {
        armorSetId: 1,
        name: 'Mapped armor',
        status: 'mapped',
        definition: { textKey: 'ArmorSetBonus.Wood', uniqueItemIds: [1, 2, 3] },
      },
      313: {
        armorSetId: 313,
        name: '空桶',
        internalCode: '空桶',
        itemIds: [999],
        status: 'expected_placeholder',
        review: {
          status: 'accepted_expected_placeholder',
          reason: 'nonstandard single-piece equipped display',
        },
        definition: {
          textKey: null,
          textZh: '空桶',
          uniqueItemIds: [999],
        },
      },
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /unaccepted placeholders: 313:空桶/.test(reason)));
});

test('buildDomainReadinessReport warns armor image fetch when warning count exceeds sampled fallback count', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    totalArmorSets: 1,
    totalArmorSetImages: 3,
    warningCount: 2,
    samples: [
      {
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: null,
        contentType: 'image/png',
      },
    ],
  });
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', { records: [{ image: 'a.png' }] });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /warningCount=2 has only 1 sampled fallback records/.test(reason)));
});

test('buildDomainReadinessReport accepts armor image fetch warnings when parsed snapshot has complete fallback evidence', () => {
  const repoRoot = createTempRepo();
  const latestParsedPath = writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', {
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    armorSetImages: [
      { textKey: 'ArmorSetBonus.Wood', originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
      { textKey: 'ArmorSetBonus.AshWood', originalUrl: 'https://terraria.wiki.gg/images/Ash_Wood_armor.png', contentType: 'image/png' },
    ],
    warnings: [
      { pageTitle: 'Missing Variant armor', message: 'missingtitle' },
      { pageTitle: 'Missing Other armor', message: 'missingtitle' },
    ],
  });
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    latestParsedPath,
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    warningCount: 2,
    samples: [
      { textKey: 'ArmorSetBonus.Wood', originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
    ],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.ok(report.checks.some((check) => /parsed snapshot fallback evidence/.test(check.message)));
});

test('buildDomainReadinessReport rejects armor image parsed snapshot outside repo', () => {
  const repoRoot = createTempRepo();
  const outsidePath = path.join(os.tmpdir(), `terrapedia-outside-armor-snapshot-${Date.now()}.json`);
  fs.writeFileSync(outsidePath, JSON.stringify({
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    armorSetImages: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
      { originalUrl: 'https://terraria.wiki.gg/images/Ash_Wood_armor.png', contentType: 'image/png' },
    ],
    warnings: [
      { pageTitle: 'Missing Variant armor', message: 'missingtitle' },
      { pageTitle: 'Missing Other armor', message: 'missingtitle' },
    ],
  }), 'utf8');
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', { armorSetImages: [], warnings: [] });
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    latestParsedPath: outsidePath,
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    warningCount: 2,
    samples: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
    ],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /has only 1 sampled fallback records/.test(reason)));
});

test('buildDomainReadinessReport accepts armor image parsed snapshot when outside-worktree path maps to shared-data canonical basename', () => {
  const repoRoot = createTempRepo();
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', {
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    armorSetImages: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
      { originalUrl: 'https://terraria.wiki.gg/images/Ash_Wood_armor.png', contentType: 'image/png' },
    ],
    warnings: [
      { pageTitle: 'Missing Variant armor', message: 'missingtitle' },
      { pageTitle: 'Missing Other armor', message: 'missingtitle' },
    ],
  });
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.2026-04-27T19-29-52.416Z.json', {
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    armorSetImages: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
      { originalUrl: 'https://terraria.wiki.gg/images/Ash_Wood_armor.png', contentType: 'image/png' },
    ],
    warnings: [
      { pageTitle: 'Missing Variant armor', message: 'missingtitle' },
      { pageTitle: 'Missing Other armor', message: 'missingtitle' },
    ],
  });
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    snapshotParsedPath: 'G:\\ClaudeCode\\TerraPedia-dev\\data\\terraPedia\\raw\\wiki\\armor_set_images.parsed.2026-04-27T19-29-52.416Z.json',
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    warningCount: 2,
    samples: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
    ],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.ok(report.checks.some((check) => /parsed snapshot fallback evidence/.test(check.message)));
});

test('buildDomainReadinessReport warns when armor image parsed snapshot totals drift', () => {
  const repoRoot = createTempRepo();
  writeSharedJson(repoRoot, 'raw/wiki/armor_set_images.parsed.latest.json', {
    totalArmorSets: 2,
    totalArmorSetImages: 3,
    armorSetImages: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
      { originalUrl: 'https://terraria.wiki.gg/images/Ash_Wood_armor.png', contentType: 'image/png' },
    ],
    warnings: [
      { pageTitle: 'Missing Variant armor', message: 'missingtitle' },
      { pageTitle: 'Missing Other armor', message: 'missingtitle' },
    ],
  });
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    latestParsedPath: 'shared-data/raw/wiki/armor_set_images.parsed.latest.json',
    totalArmorSets: 2,
    totalArmorSetImages: 2,
    warningCount: 2,
    samples: [
      { originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png', contentType: 'image/png' },
    ],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'image',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /parsed snapshot totalArmorSetImages=3 does not match report totalArmorSetImages=2/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /parsed snapshot image rows=2 does not match totalArmorSetImages=3/.test(reason)));
});

test('buildDomainReadinessReport accepts latest markdown category recipe cutover verification', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'front-nuxt/pages/categories/index.vue', '<template />');
  writeText(repoRoot, 'data-query-app/pages/categories.vue', '<template />');
  writeText(repoRoot, 'reports/relation/category-recipe-cutover-verification-2026-04-26.md', [
    '# Category / Recipe Cutover Verification',
    '',
    '- `GET http://127.0.0.1:18088/api/categories/items` -> `200`',
    '- `GET http://127.0.0.1:18088/api/items/1/recipes` -> `200`',
  ].join('\n'));

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.category',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(
    report.checks.find((check) => check.id === 'reports_relation_category_recipe_cutover_verificationlatest_md')?.latestReportPath,
    'reports/relation/category-recipe-cutover-verification-2026-04-26.md',
  );
});

test('buildDomainReadinessReport supports support-domain blocking gates from existing reports', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-04-22-051833.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    summary: { errorCount: 0 },
  });
  writeText(repoRoot, 'data-query-app/pages/entities/town-npcs/index.vue', '<template />');
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java', 'class AdminTownNpcMaintenanceController {}');

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.panelId, 'blockingGate');
  assert.equal(report.summary.presentEvidenceCount, 3);
  assert.equal(report.checks[0].latestReportPath, 'reports/wiki-town-npc-maintenance-2026-04-22-051833.json');
});

test('buildDomainReadinessReport accepts NPC source readiness with maintenance report but without legacy import report', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/npcs.standardized.json', {
    totalRecords: 1,
    records: [
      { id: 17, internalName: 'Guide', name: 'Guide', nameZh: '向导' },
    ],
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    records: [
      { id: 17, internalName: 'Guide' },
    ],
    summary: { errorCount: 0, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'npcs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.ok(!report.warningReasons.some((reason) => /reports\/wiki-town-npc-import\*\.json/.test(reason)));
});

test('buildDomainReadinessReport accepts town NPC maintenance source without legacy import report', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-town-npc-maintenance.latest.json', {
    records: [
      { id: 17, internalName: 'Guide' },
    ],
    summary: { errorCount: 0, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    records: [
      { id: 17, internalName: 'Guide' },
    ],
    summary: { errorCount: 0, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.ok(!report.warningReasons.some((reason) => /reports\/wiki-town-npc-import\*\.json/.test(reason)));
});

test('buildDomainReadinessReport warns when town NPC legacy import report is unreadable', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-town-npc-maintenance.latest.json', {
    records: [
      { id: 17, internalName: 'Guide' },
    ],
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    records: [
      { id: 17, internalName: 'Guide' },
    ],
    summary: { errorCount: 0, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });
  writeText(repoRoot, 'reports/wiki-town-npc-import-2026-05-24.json', '{not json');

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /Unreadable optional evidence: reports\/wiki-town-npc-import-2026-05-24\.json/.test(reason)));
});

test('buildDomainReadinessReport warns when town NPC legacy import report has error counters', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-town-npc-maintenance.latest.json', {
    records: [
      { id: 17, internalName: 'Guide' },
    ],
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    records: [
      { id: 17, internalName: 'Guide' },
    ],
    summary: { errorCount: 0, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-import-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    summary: { errorCount: 1, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /town NPC legacy import counters are non-zero/.test(reason)));
});

test('buildDomainReadinessReport warns when town NPC legacy import report has unmatched import counts', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-town-npc-maintenance.latest.json', {
    records: [
      { id: 17, internalName: 'Guide' },
    ],
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    records: [
      { id: 17, internalName: 'Guide' },
    ],
    summary: { errorCount: 0, blockedCount: 0, unresolvedCount: 0, driftCount: 0, duplicateCount: 0 },
  });
  writeJson(repoRoot, 'reports/wiki-town-npc-import-2026-05-24.json', {
    generatedAt: '2026-05-24T00:00:00Z',
    totalRecords: 1,
    matchedNpcCount: 0,
    unmatchedNpcCount: 1,
    unmatchedShopItemCount: 2,
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /unmatchedNpcCount=1/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /unmatchedShopItemCount=2/.test(reason)));
});

test('buildDomainReadinessReport blocks support gates when latest reports contain non-zero gate counters', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-04-22-051833.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    summary: { duplicateCount: 2, blockedCount: 1, unresolvedCount: 3, driftCount: 4 },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.summary.blockedCount, 1);
  assert.equal(report.blockingReasons.length, 1);
  assert.match(report.blockingReasons[0], /duplicateCount=2/);
  assert.match(report.blockingReasons[0], /blockedCount=1/);
  assert.match(report.blockingReasons[0], /unresolvedCount=3/);
  assert.match(report.blockingReasons[0], /driftCount=4/);
});

test('buildDomainReadinessReport warns when support gate reports do not expose known gate counters', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/wiki-town-npc-maintenance-2026-04-22-051833.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    summary: { checkedCount: 10 },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.deepEqual(report.blockingReasons, []);
  assert.ok(report.warningReasons.some((reason) => /does not expose known blocking gate counters/.test(reason)));
});

test('buildDomainReadinessReport applies recipe support gate semantics', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/recipe-provider-consolidation-2026-04-19.json', {
    generatedAt: '2026-04-19T00:00:00Z',
    apply: true,
    dryRun: false,
    before: { recipeRows: 2, activeRecipeRows: 2, activeResultItems: 2, resultItems: 2 },
    after: { recipeRows: 2, activeRecipeRows: 2, activeResultItems: 2, resultItems: 2 },
    changes: { suppressedOverlapRecipeRows: 1, gapOnlyResultItems: 3 },
  });
  writeJson(repoRoot, 'reports/recipe-provider-suppression-2026-04-09.json', {
    generatedAt: '2026-04-09T00:00:00Z',
    summary: { totalRecipeCount: 10, activeRecipeCount: 8, recipeItemCount: 4, focusProviderItemCount: 3, candidateCount: 2 },
    topCandidates: [{ itemId: 1 }],
  });
  writeJson(repoRoot, 'reports/wiki-zh-recipe-source-coverage-2026-04-09.json', {
    generatedAt: '2026-04-09T00:00:00Z',
    sourceRecipes: 10,
    wikiZhDbRecipes: 10,
    activeDbRecipes: 10,
    comparison: {
      missingFromWikiZhDbCount: 0,
      extraInWikiZhDbCount: 0,
      missingFromActiveDbCount: 0,
      trulyMissingEverywhereCount: 0,
      suppressedButPresentCount: 5,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.recipe',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.summary.blockedCount, 0);
  assert.deepEqual(report.warningReasons, []);
  assert.ok(report.checks.some((check) => /non-blocking metrics/.test(check.message)));
});

test('buildDomainReadinessReport warns when recipe non-blocking metrics exceed baseline', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/recipe-provider-consolidation-2026-04-19.json', {
    generatedAt: '2026-04-19T00:00:00Z',
    apply: true,
    dryRun: false,
    before: { recipeRows: 2, activeRecipeRows: 2, activeResultItems: 2, resultItems: 2 },
    after: { recipeRows: 2, activeRecipeRows: 2, activeResultItems: 2, resultItems: 2 },
    changes: { suppressedOverlapRecipeRows: 9999, gapOnlyResultItems: 3060, gapOnlyRecipeRows: 6751 },
  });
  writeJson(repoRoot, 'reports/recipe-provider-suppression-2026-04-09.json', {
    generatedAt: '2026-04-09T00:00:00Z',
    summary: { totalRecipeCount: 10, activeRecipeCount: 8, recipeItemCount: 4, focusProviderItemCount: 3, candidateCount: 245 },
    topCandidates: [{ itemId: 1 }],
  });
  writeJson(repoRoot, 'reports/wiki-zh-recipe-source-coverage-2026-04-09.json', {
    generatedAt: '2026-04-09T00:00:00Z',
    sourceRecipes: 10,
    wikiZhDbRecipes: 10,
    activeDbRecipes: 10,
    comparison: {
      missingFromWikiZhDbCount: 0,
      extraInWikiZhDbCount: 0,
      missingFromActiveDbCount: 0,
      trulyMissingEverywhereCount: 0,
      suppressedButPresentCount: 2557,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.recipe',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /gapOnlyResultItems=3060 exceeds baseline 3059/.test(reason)));
});

test('buildDomainReadinessReport blocks recipe support gate when source coverage is missing', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/wiki-zh-recipe-source-coverage-2026-04-09.json', {
    sourceRecipes: 10,
    wikiZhDbRecipes: 8,
    comparison: {
      missingFromWikiZhDbCount: 2,
      extraInWikiZhDbCount: 1,
      trulyMissingEverywhereCount: 1,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.recipe',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /missingFromWikiZhDbCount=2/.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /extraInWikiZhDbCount=1/.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /trulyMissingEverywhereCount=1/.test(reason)));
});

test('buildDomainReadinessReport applies item group support gate semantics', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/item-groups/any-item-group-source-audit-2026-05-01.json', {
    summary: {
      totalGroups: 63,
      duplicateGroupKeys: 29,
      unresolvedMemberReferences: 0,
      blockedGroupReferences: 1,
      consumerOnlyReferences: 0,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.item_group',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.summary.blockedCount, 0);
  assert.deepEqual(report.warningReasons, []);
  assert.ok(report.checks.some((check) => /scoped non-blocking metrics/.test(check.message)));
});

test('buildDomainReadinessReport warns when item group scoped metrics exceed baseline', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/item-groups/any-item-group-source-audit-2026-05-01.json', {
    summary: {
      totalGroups: 63,
      duplicateGroupKeys: 29,
      unresolvedMemberReferences: 0,
      blockedGroupReferences: 2,
      consumerOnlyReferences: 0,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.item_group',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.ok(report.warningReasons.some((reason) => /blockedGroupReferences=2 exceeds baseline 1/.test(reason)));
});

test('buildDomainReadinessReport blocks item group support gate unresolved members', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/item-groups/any-item-group-source-audit-2026-05-01.json', {
    summary: {
      totalGroups: 63,
      duplicateGroupKeys: 0,
      unresolvedMemberReferences: 2,
      blockedGroupReferences: 0,
      consumerOnlyReferences: 0,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.item_group',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /unresolvedMemberReferences=2/.test(reason)));
});

test('items image readiness accepts only a completed applied image-sync report', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/items.standardized.json', {
    totalRecords: 1,
    records: [{ id: 1, internalName: 'CopperShortsword', imageUrl: 'https://cdn.example.test/copper.png' }],
  });
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java', 'class PublicItemRelationController {}');

  const missing = buildDomainReadinessReport({ repoRoot, domainId: 'items', panel: 'image' });
  assert.equal(missing.status, 'warning');
  assert.ok(missing.warningReasons.some((reason) => /workflow-image-sync/.test(reason)));

  writeJson(repoRoot, 'reports/workflow-image-sync-2026-07-27.json', { apply: false, modules: {} });
  const incomplete = buildDomainReadinessReport({ repoRoot, domainId: 'items', panel: 'image' });
  assert.notEqual(incomplete.status, 'pass');

  writeJson(repoRoot, 'reports/workflow-image-sync-2026-07-27.json', {
    apply: true,
    generatedAt: '2026-07-27T00:00:00Z',
    scopes: ['items'],
    modules: {
      items: { apply: true, total: 1, candidates: 1, alreadyManaged: 0, uploaded: 1, changed: 1, missingSource: 0 },
    },
  });
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'items', panel: 'image' }).status, 'pass');

  writeJson(repoRoot, 'reports/workflow-image-sync-2026-07-27.json', {
    apply: true,
    generatedAt: '2026-07-27T00:00:00Z',
    scopes: ['items'],
    modules: {
      items: { apply: true, total: 1, candidates: 1, alreadyManaged: 1, uploaded: 0, changed: 0, missingSource: 0 },
    },
  });
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'items', panel: 'image' }).status, 'pass');
});

test('boss source readiness accepts only a completed formal boss import report', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-bosses.latest.json', {
    overview: { bossCount: 1 },
    records: [{
      status: 'ok',
      titleEn: 'King Slime',
      pageTitleEn: 'King Slime',
      sourceUrl: 'https://example.test/King_Slime',
      titleZh: '史莱姆王',
      imageUrl: 'https://example.test/king-slime.png',
    }],
  });
  writeJson(repoRoot, 'reports/wiki-bosses-fetch-2026-07-27.json', { generatedAt: '2026-07-27T00:00:00Z' });

  const missing = buildDomainReadinessReport({ repoRoot, domainId: 'bosses', panel: 'source' });
  assert.equal(missing.status, 'warning');
  assert.ok(missing.warningReasons.some((reason) => /wiki-bosses-import/.test(reason)));

  writeJson(repoRoot, 'reports/wiki-bosses-import-2026-07-27.json', { dryRun: true });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'bosses', panel: 'source' }).status, 'pass');

  writeJson(repoRoot, 'reports/wiki-bosses-import-2026-07-27.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    dryRun: false,
    totalBosses: 1,
    createdBossGroups: 1,
    updatedBossGroups: 0,
    mappedBosses: 1,
    unmappedBosses: 0,
    unresolvedBosses: [],
    remainingWikiBossImages: 0,
    remainingWikiBossMemberImages: 0,
    bossMemberImageMissingSource: 0,
    failedBossImages: 0,
    failedBossMemberImages: 0,
  });
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'bosses', panel: 'source' }).status, 'pass');
});

test('boss relation readiness accepts only a completed formal boss-loot import report', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/entity-coverage-baseline-2026-07-27.json', { generatedAt: '2026-07-27T00:00:00Z' });

  const missing = buildDomainReadinessReport({ repoRoot, domainId: 'bosses', panel: 'relation' });
  assert.equal(missing.status, 'warning');
  assert.ok(missing.warningReasons.some((reason) => /boss-loot-import/.test(reason)));

  writeJson(repoRoot, 'reports/boss-loot-import-2026-07-27.json', { dryRun: true });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'bosses', panel: 'relation' }).status, 'pass');

  writeJson(repoRoot, 'reports/boss-loot-import-2026-07-27.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    dryRun: false,
    totalBossRecords: 1,
    totalDropRecords: 1,
    targetedBossGroups: 1,
    importedBosses: 1,
    skippedBosses: 0,
    insertedLootRows: 1,
    updatedLootRows: 0,
    removedLootRows: 0,
    skippedLootRows: 0,
    unresolvedBosses: [],
    unresolvedItems: [],
  });
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'bosses', panel: 'relation' }).status, 'pass');
});

test('projectile readiness shares one completed applied backfill report', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/projectiles.standardized.json', {
    totalRecords: 1,
    records: [{ id: 1, internalName: 'WoodenArrowFriendly', name: 'Wooden Arrow', imageUrl: 'https://cdn.example.test/arrow.png' }],
  });
  writeJson(repoRoot, 'reports/relation/entity-coverage-baseline-2026-07-27.json', {
    domains: { projectiles: { localTotal: 1, maintTotal: 1, relationTotal: 1 } },
    fieldAudit: { domains: { projectiles: { fields: { nameZh: { gap: 0 }, image: { gap: 0 } } } } },
  });

  const relationMissing = buildDomainReadinessReport({ repoRoot, domainId: 'projectiles', panel: 'relation' });
  const imageMissing = buildDomainReadinessReport({ repoRoot, domainId: 'projectiles', panel: 'image' });
  assert.equal(relationMissing.status, 'warning');
  assert.equal(imageMissing.status, 'warning');

  writeJson(repoRoot, 'reports/projectile-zh-image-backfill-2026-07-27.json', { apply: false });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'projectiles', panel: 'relation' }).status, 'pass');
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'projectiles', panel: 'image' }).status, 'pass');

  writeJson(repoRoot, 'reports/projectile-zh-image-backfill-2026-07-27.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    apply: true,
    sourceMapCount: 1,
    total: 1,
    totalAvailable: 1,
    imageResolved: 1,
    unresolvedImage: 0,
    unresolvedZh: 0,
  });
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'projectiles', panel: 'relation' }).status, 'pass');
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'projectiles', panel: 'image' }).status, 'pass');
});

test('recipe source readiness accepts only a producer-shaped crawler snapshot', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/recipe-material-reference.json', { records: [{ id: 1 }] });
  writeJson(repoRoot, 'reports/wiki-zh-recipe-import-2026-07-29.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    apply: false,
    inputRecipes: 2,
  });

  const missing = buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' });
  assert.equal(missing.status, 'blocked');
  assert.ok(missing.warningReasons.some((reason) => /wiki-zh-recipe-pages/.test(reason)));

  writeJson(repoRoot, 'data/generated/wiki-zh-recipe-pages.latest.json', {});
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' }).status, 'pass');

  writeJson(repoRoot, 'data/generated/wiki-zh-recipe-pages.latest.json', {
    entity: 'wiki_zh_recipe_pages',
    generatedAt: '2026-07-27T00:00:00Z',
    sourceApi: 'https://terraria.wiki.gg/zh/api.php',
    requestedPages: ['配方'],
    summary: { crawledPages: 1, requestedPages: 1, discoveredPages: 0, recipePages: 1, recipeTableCount: 1, recipeRowCount: 1 },
    records: [{ pageTitle: '配方', requested: true, sourceUrl: 'https://terraria.wiki.gg/zh/wiki/配方', recipeTableCount: 1, recipeRowCount: 1, recipeTables: [{ rows: [{}] }] }],
  });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' }).status, 'pass');

  writeJson(repoRoot, 'data/generated/wiki-zh-recipe-pages.latest.json', {
    entity: 'wiki_zh_recipe_pages',
    generatedAt: '2026-07-27T00:00:00Z',
    sourceApi: 'https://terraria.wiki.gg/zh/api.php',
    requestedPages: ['配方'],
    summary: { crawledPages: 1, requestedPages: 1, discoveredPages: 0, recipePages: 1, recipeTableCount: 1, recipeRowCount: 1 },
    records: [{
      pageTitle: '配方',
      requested: true,
      sourceUrl: 'https://terraria.wiki.gg/zh/wiki/配方',
      recipeTableCount: 1,
      recipeRowCount: 1,
      recipeTables: [{
        tableIndex: 0,
        rowCount: 1,
        rows: [{ rowIndex: 0, resultName: '木剑', resultQuantity: 1, ingredients: [{ ingredientIndex: 0, text: '木材', quantity: 7 }] }],
      }],
    }],
  });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' }).status, 'pass');

  const verificationPath = 'reports/canonical-migration/canonical-recipe-formal-verification.json';
  writeJson(repoRoot, 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json', { apply: true });
  const verification = validRecipeFormalVerification(repoRoot);
  writeJson(repoRoot, verificationPath, verification);
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' }).status, 'pass');

  for (const mutate of [
    (value) => { value.status = 'failed'; },
    (value) => { value.mode = 'apply'; },
    (value) => { value.writesAttempted = true; },
    (value) => { value.artifacts.input.sha256 = 'f'.repeat(64); },
    (value) => { value.input.recipeCount = 2; },
    (value) => { value.formalScope.projectionHash = 'e'.repeat(64); },
    (value) => { value.formalScope.wikiZhRecipes = 2; },
    (value) => { value.formalScope.activeRecipeRows = 3; },
    (value) => { value.formalScope.unresolvedStations = 1; },
  ]) {
    const invalid = structuredClone(verification);
    mutate(invalid);
    writeJson(repoRoot, verificationPath, invalid);
    assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' }).status, 'pass');
  }

  writeJson(repoRoot, verificationPath, verification);
  writeJson(repoRoot, 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json', { apply: true, drifted: true });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'source' }).status, 'pass');
});

function validRecipeFormalVerification(repoRoot) {
  const inputHash = sha256Path(repoRoot, 'data/generated/wiki-zh-recipe-pages.latest.json');
  const pipelineHash = sha256Path(repoRoot, 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json');
  const standaloneHash = sha256Path(repoRoot, 'reports/wiki-zh-recipe-import-2026-07-29.json');
  const scopeHash = 'b'.repeat(64);
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-08T00:00:00.000Z',
    status: 'passed',
    mode: 'read-only',
    decisionId: 'canonical-recipe-apply-20260729-03',
    writesAttempted: false,
    expectedFinalProjectionHash: scopeHash,
    artifacts: {
      input: { path: 'data/generated/wiki-zh-recipe-pages.latest.json', sha256: inputHash },
      appliedPipeline: { path: 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json', sha256: pipelineHash },
      standaloneImport: { path: 'reports/wiki-zh-recipe-import-2026-07-29.json', sha256: standaloneHash },
    },
    input: { pageCount: 1, recipeCount: 1, expectedSha256: inputHash },
    appliedPipeline: {
      apply: true,
      import: {
        apply: true,
        database: 'terria_v1_local',
        inputPages: 1,
        inputRecipes: 1,
        insertedRecipes: 1,
        insertedIngredientRows: 0,
        insertedStationRows: 0,
        createdPlaceholderItems: 0,
        createdCraftingStations: 0,
        unresolvedItemRowsAfterImport: 0,
        unresolvedStationRowsAfterImport: 0,
        importedRecipeCountInDb: 1,
        recipeScopeHashTarget: 'f'.repeat(64),
      },
      displayNameBackfill: {
        apply: true,
        database: 'terria_v1_local',
        groupIngredientsUpdated: 124,
        stationsUpdated: 239,
        after: {
          groupIngredients: { needsSync: 0 },
          ingredients: { needsSync: 0 },
          stations: { needsSync: 0 },
        },
      },
      consolidation: {
        apply: true,
        dryRun: false,
        after: { recipeRows: 4, activeRecipeRows: 2, resultItems: 1, activeResultItems: 1 },
      },
    },
    formalScope: {
      database: 'terria_v1_local',
      totalRecipes: 4,
      totalIngredients: 0,
      totalStations: 0,
      consolidationRecipeRows: 4,
      activeRecipeRows: 2,
      resultItems: 1,
      activeResultItems: 1,
      wikiZhRecipes: 1,
      wikiZhIngredients: 0,
      wikiZhStations: 0,
      unresolvedItems: 0,
      unresolvedStations: 0,
      projectionHash: scopeHash,
    },
    standaloneImport: { classification: 'superseded-invalid', reasons: ['apply is not true'] },
    checks: [{ name: 'input-hash-and-counts', status: 'passed' }],
    blockingReasons: [],
  };
}

function sha256Path(repoRoot, relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex');
}

test('recipe blocking readiness rejects empty shells and accepts all three producer report shapes', () => {
  const repoRoot = createTempRepo();
  for (const reportName of [
    'recipe-provider-consolidation-2026-07-27.json',
    'recipe-provider-suppression-2026-07-27.json',
    'wiki-zh-recipe-source-coverage-2026-07-27.json',
  ]) {
    writeJson(repoRoot, `reports/${reportName}`, {});
  }
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'blocking' }).status, 'pass');

  writeJson(repoRoot, 'reports/recipe-provider-consolidation-2026-07-27.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    apply: true,
    dryRun: false,
    before: { recipeRows: 1, activeRecipeRows: 1, resultItems: 1, activeResultItems: 1 },
    after: { recipeRows: 1, activeRecipeRows: 1, resultItems: 1, activeResultItems: 1 },
    changes: { gapOnlyResultItems: 0, gapOnlyRecipeRows: 0 },
  });
  writeJson(repoRoot, 'reports/recipe-provider-suppression-2026-07-27.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    summary: { totalRecipeCount: 1, activeRecipeCount: 1, recipeItemCount: 1, focusProviderItemCount: 1, candidateCount: 0 },
    topCandidates: [],
  });
  writeJson(repoRoot, 'reports/wiki-zh-recipe-source-coverage-2026-07-27.json', {
    generatedAt: '2026-07-27T00:00:00Z',
    sourceRecipes: 1,
    wikiZhDbRecipes: 1,
    activeDbRecipes: 1,
    comparison: {
      missingFromWikiZhDbCount: 0,
      extraInWikiZhDbCount: 0,
      missingFromActiveDbCount: 0,
      suppressedButPresentCount: 0,
      trulyMissingEverywhereCount: 0,
    },
  });
  assert.equal(buildDomainReadinessReport({ repoRoot, domainId: 'support.recipe', panel: 'blocking' }).status, 'pass');
});

test('shimmer readiness requires the current verified generation and an exact completed private import result', () => {
  const repoRoot = createTempRepo();
  const publication = publishShimmerReadinessGeneration(repoRoot);
  const pointerPath = path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json');
  const pointerBytes = fs.readFileSync(pointerPath);

  try {
    writeJson(repoRoot, 'data/generated/wiki-shimmer.latest.json', { legacy: true });
    fs.rmSync(pointerPath);
    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'source' }).status,
      'pass',
      'raw-only evidence must not satisfy shimmer source readiness',
    );

    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'source' }).status,
      'pass',
      'generation-only evidence must not satisfy shimmer source readiness',
    );
    fs.writeFileSync(pointerPath, pointerBytes, { mode: 0o600 });

    const completed = buildCompletedShimmerImportResult(publication.manifest);
    writeJson(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
      completed,
      { mode: 0o600 },
    );
    const source = buildDomainReadinessReport({
      repoRoot,
      domainId: 'support.shimmer',
      panel: 'source',
      generatedAt: '2026-08-03T00:00:00Z',
    });
    assert.equal(source.status, 'pass');

    const blocking = buildDomainReadinessReport({
      repoRoot,
      domainId: 'support.shimmer',
      panel: 'blocking',
      generatedAt: '2026-08-03T00:00:00Z',
    });
    assert.equal(blocking.status, 'pass');

    const canonicalResultPath = path.join(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
    );
    fs.chmodSync(canonicalResultPath, 0o644);
    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'blocking' }).status,
      'pass',
      'a completed import result must remain private',
    );
    fs.chmodSync(canonicalResultPath, 0o600);

    const preservedSnapshots = buildCompletedShimmerImportResult(publication.manifest, {
      priorSnapshotLogicalKeys: [{
        entityType: 'wiki_shimmer_legacy',
        provider: 'wiki_zh',
        sourceKind: 'generated_json',
        sourceLocator: 'data/generated/shimmer/generations/legacy/wiki-shimmer-legacy.json',
      }],
    });
    writeJson(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
      preservedSnapshots,
      { mode: 0o600 },
    );
    assert.equal(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'blocking' }).status,
      'pass',
      'a completed import must retain frozen prior provider snapshots outside the current generation',
    );

    const droppedFrozenSnapshot = buildCompletedShimmerImportResult(publication.manifest, {
      priorSnapshotLogicalKeys: preservedSnapshots.snapshots.before.logicalKeys,
      afterSnapshotLogicalKeys: shimmerSnapshotLogicalKeys(publication.manifest),
    });
    writeJson(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
      droppedFrozenSnapshot,
      { mode: 0o600 },
    );
    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'blocking' }).status,
      'pass',
      'a completed import must not omit a frozen prior provider snapshot',
    );

    for (const [field, value] of [
      ['apply', false],
      ['status', 'failed'],
      ['generationId', 'b'.repeat(64)],
      ['dataBundleSha256', sha256('wrong-bundle')],
      ['manifestSha256', sha256('wrong-manifest')],
      ['previewSha256', sha256('wrong-preview')],
      ['targetFingerprintSha256', sha256('wrong-target')],
      ['providerScope', { ...completed.providerScope, provider: 'other' }],
    ]) {
      writeJson(
        repoRoot,
        'reports/authorization/canonical/canonical-shimmer-import.result.json',
        { ...completed, [field]: value },
        { mode: 0o600 },
      );
      assert.notEqual(
        buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'blocking' }).status,
        'pass',
        `wrong ${field} must fail closed`,
      );
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('shimmer readiness rejects noncanonical title-resolution evidence', () => {
  for (const kind of ['ambiguous', 'unresolved', 'mixed', 'unreported', 'other']) {
    const repoRoot = createTempRepo();
    const publication = publishShimmerReadinessGeneration(repoRoot, {
      titleResolutionRecords: [{ kind, nameZh: '木剑' }],
    });
    try {
      writeJson(
        repoRoot,
        'reports/authorization/canonical/canonical-shimmer-import.result.json',
        buildCompletedShimmerImportResult(publication.manifest),
        { mode: 0o600 },
      );
      const report = buildDomainReadinessReport({
        repoRoot,
        domainId: 'support.shimmer',
        panel: 'blocking',
        generatedAt: '2026-08-03T00:00:00Z',
      });
      assert.notEqual(report.status, 'pass', `${kind} title-resolution evidence must block readiness`);
      assert.match(report.blockingReasons.join('\n'), /title|reference|identity/i);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }
});

test('shimmer readiness accepts the explicit none title-resolution kind', () => {
  const repoRoot = createTempRepo();
  const publication = publishShimmerReadinessGeneration(repoRoot, {
    titleResolutionRecords: [{ kind: 'none', nameZh: '无', nameEn: null, internalName: null }],
  });
  try {
    writeJson(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
      buildCompletedShimmerImportResult(publication.manifest),
      { mode: 0o600 },
    );
    const report = buildDomainReadinessReport({
      repoRoot,
      domainId: 'support.shimmer',
      panel: 'blocking',
      generatedAt: '2026-08-03T00:00:00Z',
    });
    assert.equal(report.status, 'pass');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('shimmer source readiness rejects a generation directory symlink that resolves outside its canonical root', () => {
  const repoRoot = createTempRepo();
  const publication = publishShimmerReadinessGeneration(repoRoot);
  const generationPath = path.dirname(publication.manifestPath);
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-outside-generation-'));

  try {
    const outsideGenerationPath = path.join(outsideRoot, path.basename(generationPath));
    fs.cpSync(generationPath, outsideGenerationPath, { recursive: true });
    fs.rmSync(generationPath, { recursive: true, force: true });
    fs.symlinkSync(outsideGenerationPath, generationPath, 'dir');

    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'source' }).status,
      'pass',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('shimmer source readiness rejects a canonical generation root symlink outside the repository', () => {
  const repoRoot = createTempRepo();
  publishShimmerReadinessGeneration(repoRoot);
  const generationRoot = path.join(repoRoot, 'data', 'generated', 'shimmer', 'generations');
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-outside-generation-root-'));
  const outsideGenerationRoot = path.join(outsideRoot, 'generations');

  try {
    fs.renameSync(generationRoot, outsideGenerationRoot);
    fs.symlinkSync(outsideGenerationRoot, generationRoot, 'dir');

    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'source' }).status,
      'pass',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('shimmer source readiness rejects an external transit symlink before its in-repository generation root', () => {
  const repoRoot = createTempRepo();
  publishShimmerReadinessGeneration(repoRoot);
  const shimmerPath = path.join(repoRoot, 'data', 'generated', 'shimmer');
  const internalShimmerPath = path.join(repoRoot, 'data', 'generated', 'shimmer-internal');
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-transit-root-'));
  const outsideShimmerPath = path.join(outsideRoot, 'shimmer');

  try {
    fs.renameSync(shimmerPath, internalShimmerPath);
    fs.mkdirSync(outsideShimmerPath, { recursive: true });
    fs.symlinkSync(outsideShimmerPath, shimmerPath, 'dir');
    fs.symlinkSync(path.join(internalShimmerPath, 'generations'), path.join(outsideShimmerPath, 'generations'), 'dir');
    fs.copyFileSync(
      path.join(internalShimmerPath, 'wiki-shimmer-current-generation.json'),
      path.join(outsideShimmerPath, 'wiki-shimmer-current-generation.json'),
    );

    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'source' }).status,
      'pass',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('shimmer source readiness rejects a symbolic-link current-generation pointer', () => {
  const repoRoot = createTempRepo();
  publishShimmerReadinessGeneration(repoRoot);
  const pointerPath = path.join(repoRoot, 'data', 'generated', 'shimmer', 'wiki-shimmer-current-generation.json');
  const replacementPath = path.join(repoRoot, 'data', 'generated', 'shimmer', 'pointer-source.json');

  try {
    fs.renameSync(pointerPath, replacementPath);
    fs.symlinkSync(replacementPath, pointerPath);

    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'source' }).status,
      'pass',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('shimmer readiness rejects a canonical result beneath an ancestor symlink outside the repository', () => {
  const repoRoot = createTempRepo();
  const publication = publishShimmerReadinessGeneration(repoRoot);
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-result-outside-'));

  try {
    const canonicalDirectory = path.join(repoRoot, 'reports/authorization/canonical');
    const outsideCanonicalDirectory = path.join(outsideRoot, 'canonical');
    fs.mkdirSync(path.dirname(canonicalDirectory), { recursive: true });
    fs.mkdirSync(outsideCanonicalDirectory, { recursive: true });
    fs.symlinkSync(outsideCanonicalDirectory, canonicalDirectory, 'dir');
    const resultPath = path.join(outsideCanonicalDirectory, 'canonical-shimmer-import.result.json');
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify(buildCompletedShimmerImportResult(publication.manifest))}\n`,
      { mode: 0o600 },
    );
    fs.chmodSync(resultPath, 0o600);

    assert.notEqual(
      buildDomainReadinessReport({ repoRoot, domainId: 'support.shimmer', panel: 'blocking' }).status,
      'pass',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('resolveDomainReportPath matches domain acceptance report patterns', () => {
  assert.equal(
    resolveDomainReportPath({
      domainId: 'bosses',
      panel: 'relation',
      generatedAt: '2026-05-03T12:00:00Z',
    }),
    'reports/domain/bosses/relation-readiness-2026-05-03.json',
  );
  assert.equal(
    resolveDomainReportPath({
      domainId: 'support.recipe',
      panel: 'blocking',
      generatedAt: '2026-05-03T12:00:00Z',
    }),
    'reports/domain/support.recipe/blocking-gate-2026-05-03.json',
  );
  assert.equal(
    resolveDomainReportPath({
      domainId: 'buffs',
      panel: 'unresolved-audit-trend',
      generatedAt: '2026-05-06T12:00:00Z',
    }),
    'reports/domain/buffs/unresolved-audit-trend-2026-05-06.json',
  );
});

test('CLI prints JSON by default and writes report only when output is provided', async () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 1,
    records: [{ id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' }],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 1,
    records: { WellFed: { id: 1 } },
  });
  const outputPath = path.join(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json');

  const stdoutRun = await execFileAsync(
    process.execPath,
    [
      'scripts/data/audit/domain-readiness-audit.mjs',
      `--repo-root=${repoRoot}`,
      '--domain=buffs',
      '--panel=source',
      '--generated-at=2026-05-03T12:00:00Z',
    ],
    { cwd: process.cwd() },
  );
  assert.equal(stdoutRun.stderr, '');
  assert.equal(JSON.parse(stdoutRun.stdout).status, 'pass');
  assert.equal(fs.existsSync(outputPath), false);

  const outputRun = await execFileAsync(
    process.execPath,
    [
      'scripts/data/audit/domain-readiness-audit.mjs',
      `--repo-root=${repoRoot}`,
      '--domain=buffs',
      '--panel=source',
      '--generated-at=2026-05-03T12:00:00Z',
      '--output=reports/domain/buffs/source-readiness-2026-05-03.json',
    ],
    { cwd: process.cwd() },
  );
  assert.equal(outputRun.stderr, '');
  assert.equal(JSON.parse(outputRun.stdout).reportPath, 'reports/domain/buffs/source-readiness-2026-05-03.json');
  assert.equal(JSON.parse(await fsPromises.readFile(outputPath, 'utf8')).status, 'pass');
});

test('CLI rejects output paths outside reports/domain', async () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', { records: [{ internalName: 'WellFed' }] });
  const outsideName = `${path.basename(repoRoot)}-outside-domain-report.json`;
  const outsidePath = path.join(repoRoot, '..', outsideName);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        'scripts/data/audit/domain-readiness-audit.mjs',
        `--repo-root=${repoRoot}`,
        '--domain=buffs',
        '--panel=source',
        '--generated-at=2026-05-03T12:00:00Z',
        `--output=../${outsideName}`,
      ],
      { cwd: process.cwd() },
    ),
    /Invalid domain readiness output path/,
  );
  assert.equal(fs.existsSync(outsidePath), false);
});

test('source stays read-only and does not execute child commands', () => {
  const source = fs.readFileSync('scripts/data/audit/domain-readiness-audit.mjs', 'utf8');

  assert.doesNotMatch(source, /\bspawn\b|\bexec\b|execFile|spawnSync/);
  assert.doesNotMatch(source, /\bcreateConnection\b|\bmysql\b/i);
  assert.doesNotMatch(source, /^\s*(?:INSERT(?:\s+IGNORE)?\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|DATABASE|SCHEMA))\b/im);
});

function createTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-domain-readiness-'));
  const sharedDataRoot = path.join(repoRoot, 'shared-data');
  process.env.TERRAPEDIA_SHARED_DATA_ROOT = sharedDataRoot;
  return repoRoot;
}

function writeJson(repoRoot, relativePath, payload, options = {}) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    mode: options.mode ?? 0o644,
  });
  if (options.mode != null) fs.chmodSync(fullPath, options.mode);
  return fullPath;
}

function writeSharedJson(repoRoot, relativePath, payload) {
  return writeJson(repoRoot, path.join('shared-data', relativePath), payload);
}

function writeText(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text, 'utf8');
}

function publishShimmerReadinessGeneration(repoRoot, { titleResolutionRecords = [{ kind: 'item', nameZh: '木剑' }] } = {}) {
  return publishShimmerGeneration({
    rawBytes: Buffer.from(JSON.stringify({
      pageTitle: 'Shimmer',
      pageId: 4242,
      revisionTimestamp: '2026-08-03T00:00:00.000Z',
      html: '<table></table>',
    })),
    shards: {
      context: { entity: 'wiki_shimmer_context_importable', records: [{ code: 'SHIMMER' }] },
      itemTransforms: { entity: 'wiki_shimmer_item_transforms_importable', records: [{ key: 'item' }] },
      decraftRules: { entity: 'wiki_shimmer_decraft_rules_importable', records: [{ key: 'decraft' }] },
      entityTransforms: { entity: 'wiki_shimmer_entity_transforms_importable', records: [{ key: 'entity' }] },
      npcTransforms: { entity: 'wiki_shimmer_npc_transforms_importable', records: [{ key: 'npc' }] },
      titleResolution: { entity: 'wiki_shimmer_title_resolution', records: titleResolutionRecords },
    },
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: sha256('items') },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: sha256('npcs') },
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [] })),
    producerCodeSha256: sha256('producer'),
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-08-03T00:00:00.000Z',
    generationRoot: path.join(repoRoot, 'data/generated/shimmer/generations'),
    pointerPath: path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json'),
    runId: 'domain-readiness-test',
  });
}

function buildCompletedShimmerImportResult(manifest, {
  priorSnapshotLogicalKeys = [],
  afterSnapshotLogicalKeys = null,
} = {}) {
  const tableNames = [
    'shimmer_item_transforms',
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_npc_transforms',
  ];
  const providerScope = { provider: 'wiki_zh', sourcePage: '微光', tables: tableNames };
  const target = {
    host: '127.0.0.1',
    port: 13306,
    database: 'terria_v1_local',
    serverUuid: 'shimmer-readiness-server',
  };
  const empty = (tableName) => descriptor(tableName, 0);
  const after = (tableName, count) => descriptor(tableName, count);
  const tables = Object.fromEntries(tableNames.map((tableName, index) => [tableName, {
    before: empty(tableName),
    after: after(tableName, manifest.files[index + 2].recordCount),
  }]));
  const worldContext = { before: empty('world_contexts'), after: after('world_contexts', 1) };
  const currentSnapshotLogicalKeys = shimmerSnapshotLogicalKeys(manifest);
  const snapshots = {
    before: snapshotDescriptor(priorSnapshotLogicalKeys),
    after: snapshotDescriptor(afterSnapshotLogicalKeys ?? [
      ...priorSnapshotLogicalKeys,
      ...currentSnapshotLogicalKeys,
    ]),
  };
  const previewPayload = {
    schemaVersion: 1,
    operationId: 'canonical-shimmer-import',
    providerScope,
    generationId: manifest.generationId,
    dataBundleSha256: manifest.dataBundleSha256,
    manifestSha256: manifest.manifestSha256,
    target,
    targetFingerprintSha256: sha256Canonical(target),
    tables,
    worldContext,
    snapshots,
  };
  return {
    ...previewPayload,
    previewSha256: sha256Canonical(previewPayload),
    schemaVersion: 1,
    operationId: 'canonical-shimmer-import',
    status: 'completed',
    apply: true,
    generatedAt: '2026-08-03T00:00:00.000Z',
    transaction: { status: 'completed' },
  };
}

function descriptor(tableName, count) {
  const logicalKeys = Array.from({ length: count }, (_, index) => ({ key: `${tableName}-${index}` }));
  return {
    count,
    keySha256: sha256Canonical({ tableName, rows: logicalKeys }),
    logicalKeys,
    sha256: sha256Canonical({ tableName, rows: logicalKeys }),
  };
}

function shimmerSnapshotLogicalKeys(manifest) {
  const generationPath = `data/generated/shimmer/generations/${manifest.generationId}`;
  return [
    ['wiki_shimmer_page', 'wiki_page', 'wiki-shimmer.raw.json'],
    ['wiki_shimmer_context', 'generated_json', 'wiki-shimmer-context.importable.json'],
    ['wiki_shimmer_item_transforms', 'generated_json', 'wiki-shimmer-item-transforms.importable.json'],
    ['wiki_shimmer_decraft_rules', 'generated_json', 'wiki-shimmer-decraft-rules.importable.json'],
    ['wiki_shimmer_entity_transforms', 'generated_json', 'wiki-shimmer-entity-transforms.importable.json'],
    ['wiki_shimmer_npc_transforms', 'generated_json', 'wiki-shimmer-npc-transforms.importable.json'],
    ['wiki_shimmer_manifest', 'generated_json', 'wiki-shimmer-manifest.json'],
  ].map(([entityType, sourceKind, fileName]) => ({
    entityType,
    provider: 'wiki_zh',
    sourceKind,
    sourceLocator: `${generationPath}/${fileName}`,
  }));
}

function snapshotDescriptor(logicalKeys) {
  const rows = logicalKeys.map(stableValue).sort((left, right) => (
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  ));
  return {
    count: rows.length,
    keySha256: sha256Canonical({ tableName: 'entity_source_snapshots', rows }),
    logicalKeys: rows,
    sha256: sha256Canonical({ tableName: 'entity_source_snapshots', rows }),
    descriptors: rows.map((logicalKey) => ({
      logicalKey,
      payloadSha256: sha256(JSON.stringify(logicalKey)),
      sourcePage: '微光',
      sourceRevisionTimestamp: '2026-08-03 00:00:00',
      fetchedAt: '2026-08-03 00:00:00',
      isCurrent: 1,
      parseStatus: 'parsed',
    })),
  };
}

function sha256Canonical(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}


test('items image readiness accounts for reused objects and refuses a failed sync', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/items.standardized.json', {
    totalRecords: 1,
    records: [{ id: 1, internalName: 'CopperShortsword', imageUrl: '/terrapedia-images/items/copper.png' }],
  });
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java', 'class C {}');

  const applied = (items) => {
    writeJson(repoRoot, 'reports/workflow-image-sync-2026-08-01.json', {
      apply: true,
      status: 'completed',
      generatedAt: '2026-08-01T00:00:00Z',
      scopes: ['items'],
      modules: { items: { apply: true, ...items } },
    });
    return buildDomainReadinessReport({ repoRoot, domainId: 'items', panel: 'image' });
  };

  // A run that reused most objects must still satisfy the completion equation.
  assert.equal(applied({
    total: 6131,
    candidates: 6131,
    alreadyManaged: 2119,
    reused: 3914,
    uploaded: 98,
    changed: 4012,
    missingSource: 0,
    failedKeys: [],
  }).status, 'pass');

  // A bounded legacy-origin repair reports only its 331 repair candidates;
  // the remaining 5800 identities are already-managed and complete the total.
  assert.equal(applied({
    total: 6131,
    candidates: 331,
    alreadyManaged: 5800,
    reused: 0,
    uploaded: 0,
    changed: 331,
    missingSource: 0,
    failedKeys: [],
    normalizedKeys: Array.from({ length: 331 }, (_, index) => `Legacy${index}`),
  }).status, 'pass');

  // Dropping reuse from the accounting must break the equation, not pass silently.
  assert.notEqual(applied({
    total: 6131,
    candidates: 6131,
    alreadyManaged: 2119,
    reused: 0,
    uploaded: 98,
    changed: 4012,
    missingSource: 0,
    failedKeys: [],
  }).status, 'pass');

  // A partially applied run must never satisfy the panel.
  writeJson(repoRoot, 'reports/workflow-image-sync-2026-08-01.json', {
    apply: true,
    status: 'failed',
    generatedAt: '2026-08-01T00:00:00Z',
    scopes: ['items'],
    modules: {
      items: {
        apply: true,
        total: 6131,
        candidates: 6131,
        alreadyManaged: 2119,
        reused: 3914,
        uploaded: 94,
        changed: 4008,
        missingSource: 0,
        failedKeys: ['RainbowMoss'],
      },
    },
  });
  assert.notEqual(buildDomainReadinessReport({ repoRoot, domainId: 'items', panel: 'image' }).status, 'pass');
});
