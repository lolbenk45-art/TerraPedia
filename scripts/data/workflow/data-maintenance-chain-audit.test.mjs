import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDataMaintenanceChainAudit,
  compareImageReadinessReportCandidates,
  resolveImageReadinessInput,
} from './data-maintenance-chain-audit.mjs';

const READY_IMAGE_TEXT = [
  '- item image readiness references item_images.cached_url, original_url, and legacy wiki fallback.',
  '- buff readiness references V40__add_buff_image_cache_columns.sql, image_original_url, and image_cached_url.',
].join('\n');

test('buildDataMaintenanceChainAudit returns passing gates when all chains are ready', () => {
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: '2026-05-03T00:00:00.000Z',
    relationHealth: {
      summary: {
        blockingCount: 0,
        warningCount: 0,
      },
    },
    itemGroupAudit: {
      summary: {
        blockedGroupReferences: 0,
        duplicateGroupKeys: 0,
      },
    },
    imageReadinessText: READY_IMAGE_TEXT,
    entityCompleteness: {
      modules: {
        items: {
          standardizedCount: 6131,
          dbStats: { minio_image: '6131' },
          imageFields: [{ field: 'image', present: true }],
        },
        buffs: {
          standardizedCount: 388,
          dbStats: { minio_image: '388' },
          imageFields: [{ field: 'image', present: true }],
        },
      },
    },
  });

  assert.equal(audit.generatedAt, '2026-05-03T00:00:00.000Z');
  assert.equal(audit.status, 'pass');
  assert.deepEqual(audit.blockingReasons, []);
  assert.deepEqual(audit.warningReasons, []);
  assert.equal(audit.chains.npc_item_source_relation.status, 'pass');
  assert.equal(audit.chains.item_image_assets.status, 'pass');
  assert.equal(audit.chains.item_image_assets.ready, true);
  assert.equal(audit.chains.buff_image_assets.status, 'pass');
  assert.equal(audit.chains.buff_image_assets.ready, true);
  assert.equal(audit.chains.npc_image_assets.status, 'pass');
  assert.equal(audit.chains.any_item_groups.status, 'pass');
  assert.equal(audit.chains.recipe_item_groups, audit.chains.any_item_groups);
  assert.equal(audit.entityCompleteness.items.standardizedCount, 6131);
  assert.equal(audit.entityCompleteness.items.imageStats.minio_image, 6131);
});

test('buildDataMaintenanceChainAudit accepts structured image readiness reports', () => {
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: '2026-05-03T00:02:00.000Z',
    relationHealth: {
      summary: {
        blockingCount: 0,
        warningCount: 0,
      },
    },
    itemGroupAudit: {
      summary: {
        blockedGroupReferences: 0,
        duplicateGroupKeys: 0,
      },
    },
    imageReadinessReport: {
      generatedAt: '2026-05-03T00:01:00.000Z',
      status: 'warning',
      blockingReasons: [],
      warningReasons: [
        'npcs image assets still need a unified source/cache/fallback contract',
      ],
      entities: {
        items: {
          status: 'pass',
          unifiedContractReady: true,
        },
        buffs: {
          status: 'pass',
          unifiedContractReady: true,
        },
        npcs: {
          status: 'warning',
          unifiedContractReady: false,
        },
      },
    },
  });

  assert.equal(audit.status, 'warning');
  assert.deepEqual(audit.blockingReasons, []);
  assert.deepEqual(audit.warningReasons, [
    'npcs image assets still need a unified source/cache/fallback contract',
  ]);
  assert.equal(audit.chains.item_image_assets.status, 'pass');
  assert.equal(audit.chains.item_image_assets.ready, true);
  assert.equal(audit.chains.buff_image_assets.status, 'pass');
  assert.equal(audit.chains.buff_image_assets.ready, true);
  assert.equal(audit.chains.npc_image_assets.status, 'warning');
  assert.equal(audit.chains.npc_image_assets.ready, false);
  assert.equal(audit.chains.item_image_assets.sourceGeneratedAt, '2026-05-03T00:01:00.000Z');
});

test('resolveImageReadinessInput preserves explicit legacy text input priority', () => {
  assert.deepEqual(
    resolveImageReadinessInput(
      {
        imageReadinessText: 'docs/audits/custom-image-readiness.md',
      },
      'reports/audit/image-asset-readiness-2026-05-03.json',
    ),
    {
      imageReadinessReport: null,
      imageReadinessText: 'docs/audits/custom-image-readiness.md',
    },
  );

  assert.deepEqual(
    resolveImageReadinessInput(
      {
        imageReadinessReport: 'reports/audit/manual-image-readiness.json',
      },
      'reports/audit/image-asset-readiness-2026-05-03.json',
    ),
    {
      imageReadinessReport: 'reports/audit/manual-image-readiness.json',
      imageReadinessText: 'docs/audits/image-asset-readiness.md',
    },
  );
});

test('compareImageReadinessReportCandidates selects the newest filename date before mtime', () => {
  const candidates = [
    {
      fullPath: 'reports/audit/image-asset-readiness-2026-05-02.json',
      fileName: 'image-asset-readiness-2026-05-02.json',
      mtimeMs: 300,
    },
    {
      fullPath: 'reports/audit/image-asset-readiness-2026-05-03.json',
      fileName: 'image-asset-readiness-2026-05-03.json',
      mtimeMs: 100,
    },
    {
      fullPath: 'reports/audit/image-asset-readiness-smoke.json',
      fileName: 'image-asset-readiness-smoke.json',
      mtimeMs: 999,
    },
  ];

  candidates.sort(compareImageReadinessReportCandidates);

  assert.equal(candidates[0].fileName, 'image-asset-readiness-2026-05-03.json');
});

test('buildDataMaintenanceChainAudit treats missing structured image entities conservatively', () => {
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: '2026-05-03T00:03:00.000Z',
    relationHealth: {
      summary: {
        blockingCount: 0,
        warningCount: 0,
      },
    },
    itemGroupAudit: {
      summary: {
        blockedGroupReferences: 0,
        duplicateGroupKeys: 0,
      },
    },
    imageReadinessReport: {
      generatedAt: '2026-05-03T00:01:00.000Z',
      status: 'pass',
      blockingReasons: [],
      warningReasons: [],
      entities: {
        items: {
          status: 'pass',
          unifiedContractReady: true,
        },
      },
    },
  });

  assert.equal(audit.status, 'blocked');
  assert.equal(audit.chains.item_image_assets.status, 'pass');
  assert.equal(audit.chains.buff_image_assets.status, 'blocked');
  assert.equal(audit.chains.npc_image_assets.status, 'warning');
  assert.deepEqual(audit.blockingReasons, [
    'buffs image assets are missing from structured image readiness report',
  ]);
  assert.deepEqual(audit.warningReasons, [
    'npcs image assets are missing from structured image readiness report',
  ]);
});

test('buildDataMaintenanceChainAudit reports warnings without blocking the overall gate', () => {
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: '2026-05-03T00:05:00.000Z',
    relationHealth: {
      summary: {
        blockingCount: 0,
        warningCount: 1,
      },
    },
    itemGroupAudit: {
      summary: {
        blockedGroupReferences: 0,
        duplicateGroupKeys: 2,
      },
    },
    imageReadinessText: [
      READY_IMAGE_TEXT,
      '- NPC/Biome/Projectile/Article still need a unified source/cache/fallback contract.',
    ].join('\n'),
    entityCompleteness: {
      modules: {
        npcs: { standardizedCount: 762, dbStats: { minio_image: null } },
        projectiles: { standardizedCount: 1111, dbStats: { minio_image: '1110' } },
        biomes: { standardizedCount: 7, dbStats: { minio_image: null } },
      },
    },
  });

  assert.equal(audit.status, 'warning');
  assert.equal(audit.blockingReasons.length, 0);
  assert.deepEqual(audit.warningReasons, [
    'relation health has 1 warning',
    'Any Item Group audit has 2 duplicate group keys',
    'NPC/Biome/Projectile/Article image assets still need a unified source/cache/fallback contract',
  ]);
  assert.equal(audit.chains.npc_item_source_relation.status, 'warning');
  assert.equal(audit.chains.any_item_groups.status, 'warning');
  assert.equal(audit.chains.recipe_item_groups, audit.chains.any_item_groups);
  assert.equal(audit.chains.item_image_assets.status, 'pass');
  assert.equal(audit.chains.buff_image_assets.status, 'pass');
  assert.equal(audit.chains.npc_image_assets.status, 'warning');
  assert.equal(audit.chains.npc_item_source_relation.counts.warningCount, 1);
  assert.equal(audit.entityCompleteness.projectiles.imageStats.minio_image, 1110);
});

test('buildDataMaintenanceChainAudit blocks on relation or any item group consumer blockers', () => {
  const audit = buildDataMaintenanceChainAudit({
    generatedAt: '2026-05-03T00:10:00.000Z',
    relationHealth: {
      summary: {
        blockingCount: 3,
        warningCount: 1,
      },
    },
    itemGroupAudit: {
      summary: {
        blockedGroupReferences: 1,
        duplicateGroupKeys: 4,
      },
    },
    imageReadinessText: '',
    entityCompleteness: {
      modules: {
        items: { standardizedCount: 6131, dbStats: { minio_image: '6131' } },
        buffs: { standardizedCount: 388, dbStats: { minio_image: '388' } },
      },
    },
  });

  assert.equal(audit.status, 'blocked');
  assert.deepEqual(audit.blockingReasons, [
    'relation health has 3 blocking checks',
    'Any Item Group audit has 1 blocked consumer reference',
    'item image assets are not marked ready in image readiness text',
    'buff image assets are not marked ready in image readiness text',
  ]);
  assert.deepEqual(audit.warningReasons, [
    'relation health has 1 warning',
    'Any Item Group audit has 4 duplicate group keys',
  ]);
  assert.equal(audit.chains.npc_item_source_relation.status, 'blocked');
  assert.equal(audit.chains.any_item_groups.status, 'blocked');
  assert.equal(audit.chains.recipe_item_groups, audit.chains.any_item_groups);
  assert.equal(audit.chains.item_image_assets.status, 'blocked');
  assert.equal(audit.chains.buff_image_assets.status, 'blocked');
  assert.equal(audit.chains.npc_image_assets.status, 'pass');
  assert.ok(audit.recommendedCommands.includes('node scripts/data/relation/relation-health-report.mjs --print-checklist=true'));
  assert.ok(audit.recommendedCommands.includes('node scripts/data/audit/audit-any-item-group-sources.mjs'));
  assert.ok(audit.recommendedCommands.includes('node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=items,buffs'));
});
