import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildImageSourceLineageReport,
  buildImageSourceLineageQueries,
  loadEntitiesFromDatabase,
  loadItemImageProjectionEvidence,
  parseArgs,
  resolveItemImageProjectionEvidencePaths,
  resolveImageSourceLineageReportPath,
  runImageSourceLineageReport,
} from './image-source-lineage-report.mjs';
import {
  buildItemImageProjectionCompletedResult,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionProposal,
  buildItemImageProjectionSnapshot,
  canonicalItemImageProjectionHash,
} from '../relation/item-image-projection-contract.mjs';

const GENERATED_AT = '2026-05-06T08:00:00.000Z';

test('buildImageSourceLineageReport classifies contract readiness and gaps across seven entity types', () => {
  const itemImageProjectionEvidence = projectionEvidence();
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/items/',
      'http://localhost:9000/terrapedia-images/npcs/',
      'http://localhost:9000/terrapedia-images/projectiles/',
    ],
    entities: {
      items: {
        coreRows: [{ internalName: 'Torch', image: 'https://terraria.wiki.gg/images/Torch.png' }],
        maintImageRows: [{
          itemInternalName: 'Torch',
          originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png',
          contentType: 'image/png',
        }],
        relationImageRows: [{
          itemInternalName: 'Torch',
          originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png',
          contentType: 'image/png',
        }],
        projectionRows: itemImageProjectionEvidence.inputContract.projectionAfterRows,
      },
      buffs: {
        coreRows: [{ internalName: 'WellFed', imageCachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/well-fed.png' }],
        maintImageRows: [],
        relationImageRows: [],
        projectionRows: [{ internalName: 'WellFed', image: 'https://terraria.wiki.gg/images/Well_Fed.png' }],
      },
      npcs: {
        coreRows: [{ internalName: 'Guide', imageUrl: 'https://terraria.wiki.gg/images/Guide.png' }],
        maintImageRows: [{
          npcInternalName: 'Guide',
          originalUrl: 'https://terraria.wiki.gg/images/Guide.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/guide.png',
          contentType: 'image/png',
        }],
        relationImageRows: [],
        projectionRows: [{ internalName: 'Guide', imageUrl: 'https://terraria.wiki.gg/images/Guide.png' }],
      },
      bosses: {
        coreRows: [{ code: 'KING_SLIME', nameEn: 'King Slime', imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png' }],
        maintImageRows: [{
          bossTitleEn: 'King Slime',
          imageUrl: 'https://terraria.wiki.gg/images/King_Slime.png',
          sourcePage: 'Bosses',
          sourceRevisionTimestamp: '2026-05-06T00:00:00Z',
        }],
        relationImageRows: [{
          bossTitleEn: 'King Slime',
          imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
          sourcePage: 'Bosses',
          sourceMaintTable: 'maint_bosses',
          sourceMaintId: 1,
        }],
        projectionRows: [{
          code: 'KING_SLIME',
          imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
        }],
      },
      projectiles: {
        coreRows: [{ internalName: 'WoodenArrowFriendly', rawJson: JSON.stringify({ imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png' }) }],
        maintImageRows: [{
          projectileInternalName: 'WoodenArrowFriendly',
          rawJson: JSON.stringify({ image: 'Wooden Arrow.png' }),
          sourceProvider: 'terraria.wiki.gg',
          sourcePage: 'Module:Projectileinfo/data',
        }],
        relationImageRows: [{
          projectileInternalName: 'WoodenArrowFriendly',
          originalUrl: 'https://terraria.wiki.gg/images/Wooden%20Arrow.png',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png',
        }],
        projectionRows: [{ internalName: 'WoodenArrowFriendly', imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png' }],
      },
      armor_sets: {
        coreRows: [{
          sourceKey: 'Mythril Armor',
          maleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/8d/8d7e688c8af125976c3feb2cb4562f3df80fdc89-mythril-armor-png.png',
          femaleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/d4/d40782141fa2042ffeb3611ab428743655522e71-mythril-armor-female-png.png',
        }],
        maintImageRows: [],
        relationImageRows: [],
        projectionRows: [{
          sourceKey: 'Mythril Armor',
          maleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/8d/8d7e688c8af125976c3feb2cb4562f3df80fdc89-mythril-armor-png.png',
          femaleImages: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/d4/d40782141fa2042ffeb3611ab428743655522e71-mythril-armor-female-png.png',
          specialImages: null,
        }],
      },
      biomes: {
        coreRows: [{ biomeCode: 'forest', rawJson: JSON.stringify({ iconUrl: 'https://terraria.wiki.gg/images/Forest.png' }) }],
        maintImageRows: [],
        relationImageRows: [],
        projectionRows: [],
      },
    },
    itemImageProjectionEvidence,
  });

  assert.equal(report.generatedAt, GENERATED_AT);
  assert.equal(report.summary.totalEntityTypes, 7);
  assert.equal(report.summary.readyEntityTypes, 3);
  assert.equal(report.summary.notReadyEntityTypes, 4);

  assert.equal(report.entities.items.contractReady, true);
  assert.deepEqual(report.entities.items.gapReasons, []);

  assert.equal(report.entities.bosses.contractReady, true);
  assert.deepEqual(report.entities.bosses.gapReasons, []);

  assert.equal(report.entities.buffs.contractReady, false);
  assert.ok(report.entities.buffs.gapReasons.includes('missing_maint_image_rows'));
  assert.ok(report.entities.buffs.gapReasons.includes('missing_relation_image_rows'));
  assert.ok(report.entities.buffs.gapReasons.includes('projection_image_not_managed'));

  assert.equal(report.entities.npcs.contractReady, false);
  assert.ok(report.entities.npcs.gapReasons.includes('projection_image_not_managed'));
  assert.ok(report.entities.npcs.gapReasons.includes('missing_relation_image_rows'));
  assert.equal(report.entities.npcs.lineage.relation.rowsWithWrongManagedPrefix, 0);
  assert.equal(report.entities.npcs.lineage.projection.rowsWithWrongManagedPrefix, 0);

  assert.equal(report.entities.projectiles.contractReady, false);
  assert.ok(report.entities.projectiles.gapReasons.includes('relation_image_wrong_managed_prefix'));
  assert.ok(report.entities.projectiles.gapReasons.includes('projection_image_wrong_managed_prefix'));
  assert.equal(report.entities.projectiles.lineage.relation.rowsWithWrongManagedPrefix, 1);

  assert.equal(report.entities.armor_sets.contractReady, true);
  assert.deepEqual(report.entities.armor_sets.gapReasons, []);

  assert.equal(report.entities.biomes.contractReady, false);
  assert.ok(report.entities.biomes.gapReasons.includes('missing_projection_image_field'));
  assert.ok(report.entities.biomes.gapReasons.includes('missing_relation_image_table'));
});

test('item readiness fails closed without projection apply evidence', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    entities: {
      items: projectionReadyEntityRows(),
    },
  });
  assert.equal(report.entities.items.contractReady, false);
  assert.ok(report.entities.items.gapReasons.includes(
    'missing_item_image_projection_apply_evidence',
  ));
});

test('item readiness accepts only exact completed projection after rows', () => {
  const evidence = projectionEvidence();
  const ready = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    entities: { items: projectionReadyEntityRows(evidence.inputContract.projectionAfterRows) },
    itemImageProjectionEvidence: evidence,
  });
  assert.equal(ready.entities.items.contractReady, true);

  const driftedRows = evidence.inputContract.projectionAfterRows.map((row) => ({
    ...row,
    image: 'http://localhost:9000/terrapedia-images/items/other.png',
  }));
  const drifted = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    entities: { items: projectionReadyEntityRows(driftedRows) },
    itemImageProjectionEvidence: evidence,
  });
  assert.equal(drifted.entities.items.contractReady, false);
  assert.ok(drifted.entities.items.gapReasons.includes(
    'item_image_projection_after_rows_drifted',
  ));
});

test('item readiness ignores retained projection rows outside the frozen apply key set', () => {
  const evidence = projectionEvidence();
  const retainedLegacyRow = {
    id: 99,
    relationRecordKey: 'legacy-only-record',
    internalName: 'LegacyOnlyItem',
    image: 'http://localhost:9000/terrapedia-images/items/legacy.png',
  };
  const currentRows = [
    ...evidence.inputContract.projectionAfterRows,
    retainedLegacyRow,
  ];
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    entities: { items: projectionReadyEntityRows(currentRows) },
    itemImageProjectionEvidence: evidence,
  });
  assert.deepEqual(report.entities.items.gapReasons, []);
});

test('item readiness reports distinct projection evidence failure classes', () => {
  const base = projectionEvidence();
  const unmanagedAfterRows = base.inputContract.projectionAfterRows.map((row) => ({
    ...row,
    image: 'https://terraria.wiki.gg/images/Torch.png',
  }));
  const cases = [
    ['failed_item_image_projection_apply_evidence', {
      ...base,
      result: { ...base.result, status: 'failed' },
    }],
    ['dry_run_item_image_projection_apply_evidence', {
      ...base,
      result: { ...base.result, apply: false },
    }],
    ['stale_item_image_projection_apply_evidence', {
      ...base,
      inputBytes: Buffer.from('{}\n'),
    }],
    ['item_image_projection_lineage_drifted', {
      ...base,
      result: { ...base.result, lineage: { ...base.result.lineage, packetHash: `sha256:${'d'.repeat(64)}` } },
    }],
    ['item_image_projection_target_drifted', {
      ...base,
      result: { ...base.result, target: { ...base.result.target, serverUuid: 'other' } },
    }],
    ['item_image_projection_key_drifted', {
      ...base,
      inputContract: { ...base.inputContract, keys: ['Other'] },
    }],
    ['item_image_projection_count_drifted', {
      ...base,
      result: { ...base.result, targetRowCount: base.result.targetRowCount + 1 },
    }],
    ['item_image_projection_after_hash_drifted', {
      ...base,
      result: { ...base.result, projectionAfterSha256: `sha256:${'e'.repeat(64)}` },
    }],
    ['item_image_projection_unmanaged_evidence', {
      ...base,
      inputContract: {
        ...base.inputContract,
        projectionAfterRows: unmanagedAfterRows,
        projectionAfterSha256: canonicalItemImageProjectionHash(unmanagedAfterRows),
      },
    }],
    ['partial_item_image_projection_apply_evidence', { ...base, artifacts: [] }],
  ];
  for (const [reason, evidence] of cases) {
    const report = reportForProjectionEvidence(evidence);
    assert.ok(report.entities.items.gapReasons.includes(reason), reason);
  }
});

test('buildImageSourceLineageReport flags buff wrong-prefix managed rows', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/items/',
      'http://localhost:9000/terrapedia-images/buffs/',
    ],
    entities: {
      items: {},
      buffs: {
        coreRows: [{ internalName: 'ObsidianSkin', imageCachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/obsidian.png' }],
        maintImageRows: [{
          buffInternalName: 'ObsidianSkin',
          rawJson: JSON.stringify({ image: 'Obsidian Skin.png' }),
          sourceProvider: 'terraria.wiki.gg',
          sourcePage: 'Template:GetBuffInfo',
        }],
        relationImageRows: [{
          buffInternalName: 'ObsidianSkin',
          cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/obsidian.png',
          originalUrl: 'https://terraria.wiki.gg/images/Obsidian_Skin.png',
        }],
        projectionRows: [{
          internalName: 'ObsidianSkin',
          image: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/obsidian.png',
        }],
      },
      npcs: {},
      bosses: {},
      projectiles: {},
      armor_sets: {},
      biomes: {},
    },
  });

  assert.equal(report.entities.buffs.contractReady, false);
  assert.ok(report.entities.buffs.gapReasons.includes('relation_image_wrong_managed_prefix'));
  assert.ok(report.entities.buffs.gapReasons.includes('projection_image_wrong_managed_prefix'));
  assert.equal(report.entities.buffs.lineage.relation.rowsWithWrongManagedPrefix, 1);
  assert.equal(report.entities.buffs.lineage.projection.rowsWithWrongManagedPrefix, 1);
});

test('buildImageSourceLineageReport counts managed images stored as origin-free paths', () => {
  // The real store holds 5,800 of 6,131 item images as `/terrapedia-images/...`.
  // Counting only absolute URLs as managed reports the whole lane as unmanaged.
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/items/',
      'http://localhost:9000/terrapedia-images/npcs/',
    ],
    entities: {
      items: {
        coreRows: [{ internalName: 'BeetleHelmet', image: '/terrapedia-images/items/beetle.png' }],
        relationImageRows: [{
          itemInternalName: 'BeetleHelmet',
          cachedUrl: '/terrapedia-images/items/beetle.png',
          originalUrl: 'https://terraria.wiki.gg/images/Beetle_Helmet.png',
        }],
        projectionRows: [{ internalName: 'BeetleHelmet', image: '/terrapedia-images/items/beetle.png' }],
      },
    },
  });

  assert.equal(report.entities.items.lineage.projection.rowsWithManagedImage, 1);
  assert.equal(report.entities.items.lineage.projection.rowsWithWrongManagedPrefix, 0);
  assert.equal(report.entities.items.lineage.projection.rowsBlankButCoreImageAvailable, 0);
  assert.ok(!report.entities.items.gapReasons.includes('projection_blank_but_core_image_available'));
});

test('buildImageSourceLineageReport flags a managed path under the wrong entity prefix', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/items/',
      'http://localhost:9000/terrapedia-images/buffs/',
    ],
    entities: {
      buffs: {
        coreRows: [{ internalName: 'ObsidianSkin', imageCachedUrl: '/terrapedia-images/items/obsidian.png' }],
        projectionRows: [{ internalName: 'ObsidianSkin', image: '/terrapedia-images/items/obsidian.png' }],
      },
    },
  });

  assert.equal(report.entities.buffs.lineage.projection.rowsWithWrongManagedPrefix, 1);
  assert.ok(report.entities.buffs.gapReasons.includes('projection_image_wrong_managed_prefix'));
});

test('buildImageSourceLineageReport flags item projection holes when core managed images exist', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/items/',
    ],
    entities: {
      items: {
        coreRows: [{
          internalName: 'BeetleHelmet',
          image: 'http://localhost:9000/terrapedia-images/items/beetle.png',
        }],
        projectionRows: [{ internalName: 'BeetleHelmet', image: null }],
      },
    },
  });

  assert.equal(report.entities.items.lineage.projection.rowsBlankButCoreImageAvailable, 1);
  assert.ok(report.entities.items.gapReasons.includes('projection_blank_but_core_image_available'));
});

test('buildImageSourceLineageReport flags npc projection holes when core managed images exist', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/npcs/',
    ],
    entities: {
      npcs: {
        coreRows: [{
          internalName: 'Guide',
          imageUrl: 'http://localhost:9000/terrapedia-images/npcs/guide.png',
        }],
        projectionRows: [{ internalName: 'Guide', imageUrl: null }],
      },
    },
  });

  assert.equal(report.entities.npcs.lineage.projection.rowsBlankButCoreImageAvailable, 1);
  assert.ok(report.entities.npcs.gapReasons.includes('projection_blank_but_core_image_available'));
});

test('buildImageSourceLineageReport flags armor set projection holes when core fallback managed images exist', () => {
  const report = buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images/items/',
    ],
    entities: {
      armor_sets: {
        coreRows: [{
          textKey: 'ArmorSetBonus.BeetleDamage',
          maleImages: null,
          femaleImages: null,
          specialImages: null,
          fallbackImages: ['http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png'],
        }],
        projectionRows: [{
          textKey: 'ArmorSetBonus.BeetleDamage',
          maleImages: null,
          femaleImages: null,
          specialImages: null,
        }],
      },
    },
  });

  assert.equal(report.entities.armor_sets.lineage.projection.rowsBlankButCoreImageAvailable, 1);
  assert.ok(report.entities.armor_sets.gapReasons.includes('projection_blank_but_core_image_available'));
});

test('buildImageSourceLineageQueries stay read-only and cover the expected lineage tables', () => {
  const queries = buildImageSourceLineageQueries({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
  });

  assert.match(queries.items.core, /^\s*SELECT/i);
  assert.match(queries.items.maintImages, /maint_item_images/i);
  assert.match(queries.items.projection, /FROM `terria_v1_relation`\.`projection_items`/);
  assert.match(queries.bosses.core, /FROM `terria_v1_local`\.`boss_groups`/i);
  assert.match(queries.bosses.maintImages, /maint_bosses/i);
  assert.match(queries.bosses.relationImages, /relation_bosses/i);
  assert.match(queries.bosses.projection, /FROM `terria_v1_relation`\.`projection_bosses`/i);
  assert.doesNotMatch(queries.buffs.core, /image_path/i);
  assert.match(queries.buffs.relationImages, /relation_buff_images/i);
  assert.match(queries.npcs.maintImages, /maint_npc_images/i);
  assert.match(queries.projectiles.maintImages, /FROM `terria_v1_maint`\.`maint_projectiles`/i);
  assert.match(queries.projectiles.relationImages, /relation_projectile_images/i);
  assert.match(queries.projectiles.projection, /FROM `terria_v1_relation`\.`projection_projectiles`/i);
  assert.match(queries.buffs.projection, /FROM `terria_v1_relation`\.`projection_buffs`/i);
  assert.match(queries.armor_sets.core, /FROM `terria_v1_relation`\.`projection_armor_sets`/i);
  assert.match(queries.armor_sets.core, /related_items_json/i);
  assert.match(queries.armor_sets.core, /JSON_TABLE/i);
  assert.match(queries.armor_sets.core, /`terria_v1_local`\.`item_images`/i);
  assert.match(queries.armor_sets.core, /fallbackImage/i);
  assert.match(queries.armor_sets.core, /ii\.`item_id` IN/i);
  assert.doesNotMatch(queries.armor_sets.core, /ii\.`item_id`\s*=\s*COALESCE/i);
  assert.match(queries.armor_sets.projection, /FROM `terria_v1_relation`\.`projection_armor_sets`/i);
  assert.match(queries.biomes.core, /FROM `terria_v1_local`\.`biomes`/);
  assert.doesNotMatch(queries.biomes.core, /raw_json/i);

  for (const entityQueries of Object.values(queries)) {
    for (const sql of Object.values(entityQueries)) {
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
    }
  }
});

test('parseArgs keeps audit input and report output explicit', () => {
  const attemptRoot = `reports/authorization/canonical/item-image-projection-apply/${'6'.repeat(64)}`;
  assert.deepEqual(parseArgs([
    '--source=db',
    `--attempt-root=${attemptRoot}`,
    '--maint-database=terria_v1_maint',
    '--relation-database=terria_v1_relation',
    '--local-database=terria_v1_local',
    '--output=reports/audit/image-source-lineage.json',
  ]), {
    source: 'db',
    attemptRoot,
    output: 'reports/audit/image-source-lineage.json',
    repoRoot: null,
    generatedAt: null,
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
  });
});

test('projection readiness evidence paths require one exact attempt root', () => {
  const attemptRoot = `reports/authorization/canonical/item-image-projection-apply/${'7'.repeat(64)}`;
  assert.deepEqual(resolveItemImageProjectionEvidencePaths({ attemptRoot }), {
    attemptRoot,
    inputPath: `${attemptRoot}/input.json`,
    resultPath: `${attemptRoot}/result.json`,
  });
  for (const invalid of [
    'reports/authorization/canonical/canonical-item-image-projection-apply.input.json',
    `${attemptRoot}/child`,
    `/tmp/${'7'.repeat(64)}`,
  ]) {
    assert.throws(() => resolveItemImageProjectionEvidencePaths({
      attemptRoot: invalid,
    }), /attempt root|sha-256|exact/i);
  }
});

test('database lineage loader uses one read-only transaction and always rolls back', async () => {
  const events = [];
  const connection = {
    query: async (sql) => {
      events.push(sql.trim());
      return [[], []];
    },
    end: async () => events.push('END'),
  };
  await loadEntitiesFromDatabase({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
  }, {
    createConnection: async () => connection,
  });
  assert.equal(events[0], 'START TRANSACTION READ ONLY');
  assert.equal(events.at(-2), 'ROLLBACK');
  assert.equal(events.at(-1), 'END');
  for (const sql of events.slice(1, -2)) {
    assert.match(sql, /^SELECT/i);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
  }
});

test('projection readiness loader resolves one exact private attempt bundle', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-readiness-'));
  const evidence = projectionEvidence();
  const write = (relativePath, bytes, mode = 0o600) => {
    const output = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, bytes, { mode });
    fs.chmodSync(output, mode);
  };
  try {
    write(`${evidence.inputContract.attemptRoot}/input.json`, evidence.inputBytes);
    write(`${evidence.inputContract.attemptRoot}/result.json`, Buffer.from(`${JSON.stringify(evidence.result, null, 2)}\n`));
    write(evidence.inputContract.proposalPath, evidence.proposalBytes);
    write(evidence.inputContract.snapshotPath, evidence.snapshotBytes);
    for (const artifact of evidence.artifacts) {
      write(artifact.path, artifact.bytes, artifact.path.endsWith('.mjs') || artifact.path.includes('/audit/') ? 0o644 : 0o600);
    }
    const loaded = await loadItemImageProjectionEvidence({
      repoRoot,
      attemptRoot: evidence.inputContract.attemptRoot,
    });
    assert.equal(loaded.result.status, 'completed');
    assert.equal(loaded.inputContract.attemptRoot, evidence.inputContract.attemptRoot);
    assert.equal(loaded.artifacts.length, evidence.artifacts.length);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('database report runner converts missing or malformed projection evidence into gaps', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-readiness-runner-'));
  try {
    for (const [attemptRoot, expectedGap] of [
      [
        `reports/authorization/canonical/item-image-projection-apply/${'8'.repeat(64)}`,
        'missing_item_image_projection_apply_evidence',
      ],
      ['reports/authorization/canonical/item-image-projection-apply/not-a-hash',
        'invalid_item_image_projection_apply_evidence'],
    ]) {
      const report = await runImageSourceLineageReport([
        '--source=db',
        `--repo-root=${repoRoot}`,
        `--attempt-root=${attemptRoot}`,
        '--output=reports/audit/projection-readiness.json',
      ], {
        loadEntities: async () => ({}),
        resolveManagedUrlPrefixes: () => ['/terrapedia-images/items/'],
        writeReport: async () => {},
        writeOutput: () => {},
      });
      assert.ok(report.entities.items.gapReasons.includes(expectedGap));
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('resolveImageSourceLineageReportPath defaults to the audit reports folder', () => {
  const reportPath = resolveImageSourceLineageReportPath({ generatedAt: GENERATED_AT });
  assert.match(reportPath.replaceAll('\\', '/'), /reports\/audit\/image-source-lineage-2026-05-06\.json$/);
});

function projectionReadyEntityRows(projectionRows = projectionEvidence().inputContract.projectionAfterRows) {
  return {
    coreRows: [{ internalName: 'Torch', image: 'http://localhost:9000/terrapedia-images/items/torch.png' }],
    maintImageRows: [{
      itemInternalName: 'Torch',
      originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
      cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png',
    }],
    relationImageRows: [{
      itemInternalName: 'Torch',
      originalUrl: 'https://terraria.wiki.gg/images/Torch.png',
      cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png',
    }],
    projectionRows,
  };
}

function reportForProjectionEvidence(itemImageProjectionEvidence) {
  return buildImageSourceLineageReport({
    generatedAt: GENERATED_AT,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    entities: {
      items: projectionReadyEntityRows(
        itemImageProjectionEvidence.inputContract?.projectionAfterRows,
      ),
    },
    itemImageProjectionEvidence,
  });
}

function projectionEvidence() {
  const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const proposalDecisionIdentity = 'readiness-proposal-decision';
  const attemptRoot = buildItemImageProjectionAttemptPaths(proposalDecisionIdentity).attemptRoot;
  const prefix = 'http://localhost:9000/terrapedia-images/items/';
  const ownerPath = `${attemptRoot}/proposal-read.owner-input.json`;
  const ownerBytes = Buffer.from('{"authorized":true}\n');
  const lineageInputPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json';
  const lineageResultPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json';
  const lineageBundlePath = 'reports/audit/item-image-lineage.bundle.json';
  const lineageSnapshotPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json';
  const lineagePacketPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json';
  const lineageInputBytes = Buffer.from('{"lineage":"input"}\n');
  const lineageResultBytes = Buffer.from('{"lineage":"result"}\n');
  const lineageBundleBytes = Buffer.from('{"lineage":"bundle"}\n');
  const lineageSnapshotBytes = Buffer.from('{"lineage":"snapshot"}\n');
  const lineagePacketBytes = Buffer.from('{"lineage":"packet"}\n');
  const policyPath = 'scripts/data/relation/managed-image-url-policy.mjs';
  const policyBytes = Buffer.from('export const readinessPolicy = true;\n');
  const target = {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'lineage-readiness-server',
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
    ownedColumn: 'image',
  };
  target.fingerprintSha256 = canonicalItemImageProjectionHash(target);
  const managedUrlPolicy = {
    sourcePath: policyPath,
    sourceSha256: sha(policyBytes),
    resolvedPrefixesSha256: canonicalItemImageProjectionHash([prefix]),
  };
  const relationRows = [{
    recordKey: 'relation-torch',
    internalName: 'Torch',
    cachedUrl: `${prefix}torch.png`,
    role: 'icon',
    isPrimary: 1,
    status: 1,
    deleted: 0,
  }];
  const projectionRows = [{
    id: 1,
    relationRecordKey: 'relation-torch',
    internalName: 'Torch',
    image: '/legacy/torch.png',
    status: 1,
    deleted: 0,
  }];
  const snapshot = buildItemImageProjectionSnapshot({
    generatedAt: '2026-05-06T07:00:00.000Z',
    target,
    managedUrlPolicy,
    managedUrlPrefixes: [prefix],
    lineageKeys: ['Torch'],
    relationRows,
    projectionRows,
  });
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  const proposal = buildItemImageProjectionProposal({
    generatedAt: snapshot.generatedAt,
    expiresAt: '2026-05-07T07:00:00.000Z',
    proposalAuthorization: {
      path: ownerPath,
      sha256: sha(ownerBytes),
      decisionIdentity: proposalDecisionIdentity,
      authorizationHash: `sha256:${'a'.repeat(64)}`,
    },
    lineage: {
      inputContractPath: lineageInputPath,
      inputContractSha256: sha(lineageInputBytes),
      resultPath: lineageResultPath,
      resultSha256: sha(lineageResultBytes),
      bundlePath: lineageBundlePath,
      bundleSha256: sha(lineageBundleBytes),
      applySnapshotPath: lineageSnapshotPath,
      applySnapshotSha256: sha(lineageSnapshotBytes),
      authorizationPacketPath: lineagePacketPath,
      authorizationPacketSha256: sha(lineagePacketBytes),
      decisionIdentity: 'lineage-decision',
      packetHash: `sha256:${'b'.repeat(64)}`,
      dispatchPermitHash: `sha256:${'c'.repeat(64)}`,
      completedRowCount: 1,
    },
    lineageKeys: ['Torch'],
    target,
    snapshotPath: `${attemptRoot}/snapshot.json`,
    snapshotSha256: `sha256:${createHash('sha256').update(snapshotBytes).digest('hex')}`,
    managedUrlPolicy,
    managedUrlPrefixes: [prefix],
    relationRows,
    projectionRows,
  });
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
  const inputContract = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: `${attemptRoot}/proposal.json`,
    proposalSha256: `sha256:${createHash('sha256').update(proposalBytes).digest('hex')}`,
  });
  const inputBytes = Buffer.from(`${JSON.stringify(inputContract, null, 2)}\n`);
  const result = buildItemImageProjectionCompletedResult({
    inputContract,
    inputContractPath: `${attemptRoot}/input.json`,
    inputContractSha256: `sha256:${createHash('sha256').update(inputBytes).digest('hex')}`,
    completedAt: '2026-05-06T07:30:00.000Z',
  });
  return {
    result,
    inputContract,
    proposal,
    snapshot,
    inputBytes,
    proposalBytes,
    snapshotBytes,
    artifacts: [
      { path: ownerPath, bytes: ownerBytes },
      { path: lineageInputPath, bytes: lineageInputBytes },
      { path: lineageResultPath, bytes: lineageResultBytes },
      { path: lineageBundlePath, bytes: lineageBundleBytes },
      { path: lineageSnapshotPath, bytes: lineageSnapshotBytes },
      { path: lineagePacketPath, bytes: lineagePacketBytes },
      { path: policyPath, bytes: policyBytes },
    ],
  };
}
