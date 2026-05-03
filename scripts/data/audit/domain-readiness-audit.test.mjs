import test from 'node:test';
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

test('buildDomainReadinessReport warns instead of blocking current legacy buff name gaps', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 2,
    records: [
      { id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' },
      { id: 138, internalName: 'MinecartLegacyUnused', englishName: null, type: 'buff' },
    ],
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'buffs',
    panel: 'source',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.summary.blockedCount, 0);
  assert.ok(report.warningReasons.some((reason) => reason.includes('1 buff records missing required fields')));
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

test('buildDomainReadinessReport warns for product public readiness when public route is absent', () => {
  const repoRoot = createTempRepo();
  writeText(repoRoot, 'back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java', 'class AdminArmorSetController {}');

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'armor_sets',
    panel: 'public',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.deepEqual(report.blockingReasons, []);
  assert.ok(report.warningReasons.includes('Missing optional evidence: front/src/router/routes.ts'));
  assert.ok(report.warningReasons.includes('Missing optional evidence: front/src/views'));
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
  writeJson(repoRoot, 'reports/wiki-bosses-import-2026-04-21.json', { ok: true });

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

  assert.equal(buffs.status, 'warning');
  assert.equal(buffs.summary.blockedCount, 0);
  assert.equal(projectiles.status, 'warning');
  assert.equal(projectiles.summary.blockedCount, 0);
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
    totalRecords: 2,
    records: [
      { id: 1, internalName: 'WoodenArrowFriendly', name: 'Wooden Arrow' },
      { id: 2, internalName: 'FireArrow', name: 'Flaming Arrow' },
    ],
  });
  writeJson(repoRoot, 'data/standardized-view/projectiles/_meta.json', { totalRecords: 2 });
  writeJson(repoRoot, 'reports/projectile-zh-image-backfill-2026-04-22.json', {
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
  assert.equal(relation.status, 'warning');
  assert.ok(relation.warningReasons.some((reason) => /unresolvedZh=1/.test(reason)));
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
    records: {},
  });
  writeJson(repoRoot, 'reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json', {
    totalArmorSets: 1,
    totalArmorSetImages: 3,
    warningCount: 1,
  });
  writeJson(repoRoot, 'data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json', { records: [{ image: 'a.png' }] });

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
  assert.match(source.warningReasons.find((reason) => reason.includes('definition map')), /placeholder=1/);
  assert.equal(image.status, 'warning');
  assert.ok(image.warningReasons.some((reason) => /warningCount=1/.test(reason)));
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
    after: { activeResultItems: 2, resultItems: 2 },
    changes: { suppressedOverlapRecipeRows: 1, gapOnlyResultItems: 3 },
  });
  writeJson(repoRoot, 'reports/recipe-provider-suppression-2026-04-09.json', {
    summary: { candidateCount: 2 },
  });
  writeJson(repoRoot, 'reports/wiki-zh-recipe-source-coverage-2026-04-09.json', {
    sourceRecipes: 10,
    wikiZhDbRecipes: 10,
    comparison: {
      missingFromWikiZhDbCount: 0,
      extraInWikiZhDbCount: 0,
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

  assert.equal(report.status, 'warning');
  assert.equal(report.summary.blockedCount, 0);
  assert.ok(report.warningReasons.some((reason) => /suppressedOverlapRecipeRows=1/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /candidateCount=2/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /suppressedButPresentCount=5/.test(reason)));
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

test('buildDomainReadinessReport applies shimmer support gate semantics', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/wiki-shimmer-db-import-2026-04-22.json', {
    counts: {
      itemTransforms: 279,
      decraftRules: 248,
      entityTransforms: 121,
      npcTransforms: 29,
      unresolvedTitles: 0,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.shimmer',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.summary.blockedCount, 0);
  assert.ok(report.warningReasons.some((reason) => reason.includes('Missing optional evidence: back/src/main/java/com/terraria/skills/controller/AdminShimmerController.java')));
  assert.ok(report.checks.some((check) => check.status === 'pass' && /shimmer import semantic gates are clean/.test(check.message)));
});

test('buildDomainReadinessReport blocks shimmer support gate unresolved titles', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/wiki-shimmer-db-import-2026-04-22.json', {
    counts: {
      itemTransforms: 279,
      decraftRules: 248,
      entityTransforms: 121,
      npcTransforms: 29,
      unresolvedTitles: 2,
    },
  });

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.shimmer',
    panel: 'blocking',
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(report.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /unresolvedTitles=2/.test(reason)));
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

  assert.equal(report.status, 'warning');
  assert.equal(report.summary.blockedCount, 0);
  assert.ok(report.warningReasons.some((reason) => /duplicateGroupKeys=29/.test(reason)));
  assert.ok(report.warningReasons.some((reason) => /blockedGroupReferences=1/.test(reason)));
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
  assert.doesNotMatch(source, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
});

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-domain-readiness-'));
}

function writeJson(repoRoot, relativePath, payload) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text, 'utf8');
}
