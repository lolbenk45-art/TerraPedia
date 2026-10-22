import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemsSourceManifest,
  ITEM_RELATIONS_META_PATH,
  ITEMS_SOURCE_PATHS,
  selectRankStratifiedItemRecords,
} from './eight-domain-items-source-manifest.mjs';

function writeJson(root, relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value)}\n`);
  return target;
}

function buildFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e8pr-items-source-'));
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    internalName: `Item${index + 1}`,
    name: `Item ${index + 1}`,
    categoryCode: 'material',
    stats: { damage: index + 5 },
    stack: { stackSize: index + 1 },
  }));
  const pages = items.map((item, index) => ({
    itemInternalName: item.internalName,
    itemName: item.name,
    pageId: 1000 + index,
    revisionTimestamp: `2026-10-01T00:00:${String(index).padStart(2, '0')}Z`,
    hasHtml: true,
    wikitextLength: 50 + index,
  }));
  writeJson(root, 'data/standardized/items.standardized.json', {
    entity: 'items',
    totalRecords: items.length,
    records: items,
  });
  writeJson(root, 'data/standardized/item_pages.standardized.json', {
    entity: 'item_pages',
    totalRecords: pages.length,
    records: pages,
  });
  writeJson(root, 'data/standardized-view/items/_meta.json', {
    entity: 'items',
    totalRecords: items.length,
  });
  writeJson(root, 'data/standardized-view/item_pages/_meta.json', {
    entity: 'item_pages',
    totalRecords: pages.length,
  });
  const relationParts = [
    { name: 'biomes/part-0001.json', records: 1, payload: [{ code: 'forest', nameEn: 'Forest' }] },
    { name: 'itemBiomes/part-0001.json', records: 1, payload: [{ itemInternalName: 'Item2', biomeCode: 'forest' }] },
    { name: 'itemImages/part-0001.json', records: 1, payload: [{ itemInternalName: 'Item2', role: 'icon' }] },
    { name: 'itemSources/part-0001.json', records: 1, payload: [{ itemInternalName: 'Item2', sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Zombie', biomeCode: 'forest' }] },
    { name: 'recipes/part-0001.json', records: 3, payload: [
      { resultInternalName: 'Item2', ingredients: [{ ingredientInternalName: 'Item1', quantityMin: 1 }], stations: [{ stationInternalName: 'Item8' }] },
      { resultInternalName: 'Item10', ingredients: [{ ingredientInternalName: 'Item9', quantityMin: 1 }] },
      { resultInternalName: 'Item10', ingredients: [{ ingredientInternalName: 'Item8', quantityMin: 1 }] },
    ] },
    { name: 'snapshots/part-0001.json', records: 2, missing: true },
  ];
  for (const part of relationParts.filter((entry) => !entry.missing)) writeJson(root, `data/standardized-view/item_relations/${part.name}`, part.payload);
  writeJson(root, 'data/standardized-view/item_relations/_meta.json', {
    entity: 'item_relations',
    totalRecords: relationParts.reduce((sum, part) => sum + part.records, 0),
    mode: 'object-arrays',
    parts: relationParts.map(({ name, records }) => ({ name, records })),
  });
  return { root, items, pages, relationParts };
}

function fixtureSourceHashes(root) {
  return Object.fromEntries(Object.values(ITEMS_SOURCE_PATHS).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    return [relativePath, `sha256:${createHash('sha256').update(bytes).digest('hex')}`];
  }));
}

function fixtureRelationHashes(root) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, ITEM_RELATIONS_META_PATH), 'utf8'));
  const hashes = {
    [ITEM_RELATIONS_META_PATH]: `sha256:${createHash('sha256').update(fs.readFileSync(path.join(root, ITEM_RELATIONS_META_PATH))).digest('hex')}`,
  };
  for (const part of meta.parts) {
    const relativePath = path.posix.join(path.posix.dirname(ITEM_RELATIONS_META_PATH), part.name);
    const absolutePath = path.join(root, relativePath);
    if (fs.existsSync(absolutePath)) {
      hashes[relativePath] = `sha256:${createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')}`;
    }
  }
  return hashes;
}

function fixtureItems() {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    internalName: `Item${index + 1}`,
    name: `Item ${index + 1}`,
    categoryCode: 'material',
  }));
}

function landing(items = fixtureItems()) {
  return {
    id: 6470,
    dataset_type: 'items_raw',
    provider: 'terraria.wiki.gg',
    source_key: 'wiki.module.iteminfo',
    source_page: 'Module:Iteminfo/data',
    source_kind: 'wiki_module',
    source_locator: null,
    source_revision_timestamp: '2026-08-22T11:26:22Z',
    content_hash: 'a'.repeat(64),
    is_current: 1,
    parse_status: 'ok',
    artifact_role: 'legacy_compat',
    producer_id: 'legacy.test',
    producer_version: '1',
    producer_run_key: 'legacy-test',
    bootstrap_manifest_hash: null,
    full_file_content_hash: null,
    full_file_byte_size: null,
    fetched_at: null,
    parsed_at: null,
    notes: null,
    created_at: '2026-08-22 11:26:22',
    updated_at: '2026-08-22 11:26:22',
    payload_json: JSON.stringify({
      moduleContent: `return { ["data"] = [=====[${JSON.stringify({
        _generated: '2026-08-22 11:26:22 (+00:00)',
        _terrariaversion: '1.4.5.6',
        ...Object.fromEntries(items.map((item) => [String(item.id), {
          internalName: item.internalName,
          name: item.name,
          damage: item.stats?.damage ?? 0,
        }])),
      })}]=====] }`,
      pageTitle: 'Module:Iteminfo/data',
    }),
  };
}

test('selectRankStratifiedItemRecords uses deterministic midpoint IDs', () => {
  const records = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, internalName: `Item${index + 1}` }));
  const selected = selectRankStratifiedItemRecords({ records, limit: 4 });
  assert.deepEqual(selected.map((record) => record.id), [2, 4, 7, 9]);
});

test('buildItemsSourceManifest binds frozen files, selected pages, and the exact ItemInfo landing', () => {
  const { root, items, pages } = buildFixtureRoot();
  const result = buildItemsSourceManifest({
    repoRoot: root,
    landing: landing(),
    limit: 4,
    expectedRecordCount: 10,
    runId: 'e8pr-items-20261017-v1',
    expectedSourceHashes: fixtureSourceHashes(root),
    expectedRelationHashes: fixtureRelationHashes(root),
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.sourceMode, 'repository-frozen');
  assert.equal(result.networkAccess, false);
  assert.equal(result.runId, 'e8pr-items-20261017-v1');
  assert.equal(result.recordCount, items.length);
  assert.deepEqual(result.selectedIds, [2, 4, 7, 9]);
  assert.equal(result.selectedPages.length, 4);
  assert.deepEqual(result.selectedPages.map((page) => page.pageId), [1001, 1003, 1006, 1008]);
  assert.equal(result.selectedItems[0].stats.damage, items[1].stats.damage);
  assert.equal(result.selectedItems[0].stack.stackSize, items[1].stack.stackSize);
  assert.equal(result.selectedPages[0].wikitextLength, pages[1].wikitextLength);
  assert.deepEqual(result.itemRelations.selectedRecordCounts, {
    biomes: 1,
    itemBiomes: 1,
    itemImages: 1,
    itemSources: 1,
    recipes: 2,
  });
  assert.deepEqual(result.itemRelations.recipeDependencyItemIds, [1, 8, 10]);
  assert.deepEqual(result.itemRelations.npcReferenceNames, ['Zombie']);
  assert.match(result.itemRelations.relationBundleSha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.itemRelations.sourceRecordCounts, {
    biomes: 1,
    itemBiomes: 1,
    itemImages: 1,
    itemSources: 1,
    recipes: 3,
    snapshots: 2,
  });
  assert.deepEqual(Object.keys(result.itemRelations.selectedRowsSha256).sort(), [
    'biomes', 'itemBiomes', 'itemImages', 'itemSources', 'recipes',
  ]);
  assert.deepEqual(result.itemRelations.partHashes.map((part) => part.recordCount), [1, 1, 1, 1, 3]);
  assert.match(result.itemRelations.selectedRowsSha256.recipes, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.itemRelations.excludedSnapshots.declaredRecordCount, 2);
  assert.equal(result.itemRelations.excludedSnapshots.missingPartCount, 1);
  assert.equal(result.landing.sourceKey, 'wiki.module.iteminfo');
  assert.equal(result.landing.sourceId, 6470);
  assert.equal(result.landing.contentHash, 'sha256:' + 'a'.repeat(64));
  assert.equal(result.landing.provider, 'terraria.wiki.gg');
  assert.equal(result.landing.payloadSha256, `sha256:${createHash('sha256').update(landing().payload_json).digest('hex')}`);
  assert.equal(result.selectedItems[0].sourceRecordSha256.startsWith('sha256:'), true);
  assert.equal(result.selectedPages[0].sourceRecordSha256.startsWith('sha256:'), true);
  assert.equal(result.itemInfoMatches.length, 4);
  assert.equal(result.productionSourceDelta, false);
  assert.match(result.selectedIdsSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.manifestSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.sourceFiles.length, 4);
  assert.equal(result.sourceFiles[0].recordCount, items.length);
  assert.equal(result.sourceFiles[1].recordCount, pages.length);
});

test('buildItemsSourceManifest requires every Item API relation group and rejects malformed present snapshot parts', () => {
  const missingGroup = buildFixtureRoot();
  const metaPath = path.join(missingGroup.root, ITEM_RELATIONS_META_PATH);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.parts = meta.parts.filter((part) => !part.name.startsWith('itemSources/'));
  meta.totalRecords = meta.parts.reduce((sum, part) => sum + part.records, 0);
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  assert.throws(() => buildItemsSourceManifest({
    repoRoot: missingGroup.root,
    landing: landing(),
    limit: 4,
    expectedRecordCount: 10,
    expectedSourceHashes: fixtureSourceHashes(missingGroup.root),
    expectedRelationHashes: fixtureRelationHashes(missingGroup.root),
  }), /required Item relation group itemSources is missing/i);

  const malformedSnapshot = buildFixtureRoot();
  writeJson(malformedSnapshot.root, 'data/standardized-view/item_relations/snapshots/part-0001.json', [{ snapshotKey: 'one' }]);
  assert.throws(() => buildItemsSourceManifest({
    repoRoot: malformedSnapshot.root,
    landing: landing(),
    limit: 4,
    expectedRecordCount: 10,
    expectedSourceHashes: fixtureSourceHashes(malformedSnapshot.root),
    expectedRelationHashes: fixtureRelationHashes(malformedSnapshot.root),
  }), /snapshot.*record count differs from metadata/i);
});

test('buildItemsSourceManifest rejects recipe references without stable Item IDs', () => {
  const fixture = buildFixtureRoot();
  const recipePath = path.join(fixture.root, 'data/standardized-view/item_relations/recipes/part-0001.json');
  const recipes = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  recipes[0].ingredients.push({ ingredientGroupType: 'item', ingredientInternalName: 'UnlistedItem' });
  fs.writeFileSync(recipePath, JSON.stringify(recipes));
  assert.throws(() => buildItemsSourceManifest({
    repoRoot: fixture.root,
    landing: landing(),
    limit: 4,
    expectedRecordCount: 10,
    expectedSourceHashes: fixtureSourceHashes(fixture.root),
    expectedRelationHashes: fixtureRelationHashes(fixture.root),
  }), /recipe dependency UnlistedItem has no stable Item ID/i);
});

test('buildItemsSourceManifest rejects page gaps, landing drift, and selected-ID hash drift', () => {
  const fixture = buildFixtureRoot();
  const missingPageRoot = buildFixtureRoot();
  const pagesPath = path.join(missingPageRoot.root, 'data/standardized/item_pages.standardized.json');
  const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
  pages.records = pages.records.map((page) => page.itemInternalName === 'Item7'
    ? { ...page, itemInternalName: 'UnboundItem' }
    : page);
  fs.writeFileSync(pagesPath, JSON.stringify(pages));
  assert.throws(
    () => buildItemsSourceManifest({ repoRoot: missingPageRoot.root, landing: landing(), limit: 4, expectedRecordCount: 10, expectedSourceHashes: fixtureSourceHashes(missingPageRoot.root) }),
    /selected Item page is missing/,
  );

  assert.throws(
    () => buildItemsSourceManifest({ repoRoot: fixture.root, landing: { ...landing(), source_key: 'wiki.module.other' }, limit: 4, expectedRecordCount: 10, expectedSourceHashes: fixtureSourceHashes(fixture.root) }),
    /source_key must be wiki\.module\.iteminfo/,
  );

  assert.throws(
    () => buildItemsSourceManifest({ repoRoot: fixture.root, landing: landing(), limit: 4, expectedRecordCount: 10, expectedSelectedIdsSha256: 'sha256:' + 'b'.repeat(64), expectedSourceHashes: fixtureSourceHashes(fixture.root) }),
    /selected Item ID hash drift/,
  );
});

test('buildItemsSourceManifest checks selected identities against the unmodified ItemInfo landing and pinned file hashes', () => {
  const { root, items } = buildFixtureRoot();
  const missingRawItem = items.filter((item) => item.id !== 7);
  assert.throws(
    () => buildItemsSourceManifest({ repoRoot: root, landing: landing(missingRawItem), limit: 4, expectedRecordCount: 10, expectedSourceHashes: fixtureSourceHashes(root) }),
    /ItemInfo landing is missing selected Item ID 7/,
  );

  const driftedRawItem = items.map((item) => item.id === 4 ? { ...item, internalName: 'ChangedInternalName' } : item);
  assert.throws(
    () => buildItemsSourceManifest({ repoRoot: root, landing: landing(driftedRawItem), limit: 4, expectedRecordCount: 10, expectedSourceHashes: fixtureSourceHashes(root) }),
    /ItemInfo internalName drift for selected Item ID 4/,
  );

  assert.throws(
    () => buildItemsSourceManifest({
      repoRoot: root,
      landing: landing(),
      limit: 4,
      expectedRecordCount: 10,
      expectedSourceHashes: {
        ...fixtureSourceHashes(root),
        [ITEMS_SOURCE_PATHS.items]: `sha256:${'c'.repeat(64)}`,
      },
    }),
    /source file hash drift/,
  );

  assert.throws(
    () => buildItemsSourceManifest({
      repoRoot: root,
      landing: landing(),
      limit: 4,
      expectedRecordCount: 10,
      expectedSourceHashes: {
        ...fixtureSourceHashes(root),
        'data/standardized/unrelated.json': `sha256:${'d'.repeat(64)}`,
      },
    }),
    /must bind exactly the four standardized Item\/page files/,
  );

  const duplicatePageRoot = buildFixtureRoot();
  const duplicatePagesPath = path.join(duplicatePageRoot.root, 'data/standardized/item_pages.standardized.json');
  const duplicatePages = JSON.parse(fs.readFileSync(duplicatePagesPath, 'utf8'));
  duplicatePages.records[1].itemInternalName = duplicatePages.records[0].itemInternalName;
  fs.writeFileSync(duplicatePagesPath, JSON.stringify(duplicatePages));
  assert.throws(
    () => buildItemsSourceManifest({
      repoRoot: duplicatePageRoot.root,
      landing: landing(),
      limit: 4,
      expectedRecordCount: 10,
      expectedSourceHashes: fixtureSourceHashes(duplicatePageRoot.root),
    }),
    /duplicate identity/,
  );
});

test('buildItemsSourceManifest requires all four pinned file hashes and the fixed run/source identity', () => {
  const { root } = buildFixtureRoot();
  assert.throws(
    () => buildItemsSourceManifest({ repoRoot: root, landing: landing(), limit: 4, expectedRecordCount: 10 }),
    /expected source hashes are required/,
  );
  assert.throws(
    () => buildItemsSourceManifest({
      repoRoot: root,
      landing: landing(),
      limit: 4,
      expectedRecordCount: 10,
      expectedSourceHashes: fixtureSourceHashes(root),
      runId: 'e8pr-items-other-run',
    }),
    /runId differs from the fixed isolated allocation/,
  );
  assert.throws(
    () => buildItemsSourceManifest({
      repoRoot: root,
      landing: { ...landing(), provider: 'other.provider' },
      limit: 4,
      expectedRecordCount: 10,
      expectedSourceHashes: fixtureSourceHashes(root),
    }),
    /provider must be terraria\.wiki\.gg/,
  );
});
