import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  listSourceDatasetLandingInputs,
  resolveDatasetFilter,
} from './source-dataset-locator.mjs';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('resolveDatasetFilter parses comma separated dataset list', () => {
  assert.deepEqual(resolveDatasetFilter('items_raw,recipes_raw'), ['items_raw', 'recipes_raw']);
  assert.deepEqual(resolveDatasetFilter(''), []);
  assert.deepEqual(resolveDatasetFilter(undefined), []);
});

test('listSourceDatasetLandingInputs locates single-file and multi-file landing sources', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-landing-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');

  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'module__iteminfo__data.latest.json'), {
    moduleTitle: 'Module:Iteminfo/data',
    pageTitle: 'Module:Iteminfo/data',
    fetchedAt: '2026-04-23T01:00:00.000Z',
    revisionTimestamp: '2026-04-22T10:00:00Z',
  });
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'), {
    sourcePageTitle: 'Module:Npcinfo/data',
    fetchedAt: '2026-04-23T01:01:00.000Z',
    sourceRevisionTimestamp: '2026-04-22T10:01:00Z',
  });
  await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json'), {
    entity: 'npcs',
    generatedAt: '2026-04-23T01:01:30.000Z',
    records: [
      {
        id: 480,
        internalName: 'Medusa',
        name: 'Medusa',
        combat: { damage: 30 },
        wikiCrawler: { combat: { projectileId: '24' } },
      },
    ],
  });
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'item-pages', 'zenith.latest.json'), {
    pageTitle: 'Zenith',
    fetchedAt: '2026-04-23T01:02:00.000Z',
    revisionTimestamp: '2026-04-22T10:02:00Z',
  });
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'item-pages', 'meowmere.latest.json'), {
    pageTitle: 'Meowmere',
    fetchedAt: '2026-04-23T01:03:00.000Z',
    revisionTimestamp: '2026-04-22T10:03:00Z',
  });
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'biomes', 'forest.latest.json'), {
    pageTitle: 'Forest',
    fetchedAt: '2026-04-23T01:04:00.000Z',
    revisionTimestamp: '2026-04-22T10:04:00Z',
  });
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'armor_set_images.parsed.latest.json'), {
    sourcePageTitle: 'Armor set pages',
    fetchedAt: '2026-04-23T01:05:00.000Z',
    sourceRevisionTimestamp: null,
    armorSetImages: [],
    warnings: [],
  });
  await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json'), {
    generatedAt: '2026-04-23T02:00:00.000Z',
    records: [
      {
        pageTitleEn: 'King Slime',
        revisionTimestamp: '2026-04-22T11:00:00Z',
        status: 'ok',
      },
      {
        pageTitleEn: 'Eye of Cthulhu',
        revisionTimestamp: '2026-04-22T11:01:00Z',
        status: 'ok',
      },
    ],
  });
  await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-item-categories.latest.json'), {
    generatedAt: '2026-04-23T02:01:00.000Z',
    templates: [
      {
        templateTitle: 'Template:Master Template Weapons',
        sourceRevisionTimestamp: '2026-04-22T11:02:00Z',
      },
      {
        templateTitle: 'Template:Master Template Armor',
        sourceRevisionTimestamp: '2026-04-22T11:03:00Z',
      },
    ],
  });
  await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json'), {
    generatedAt: '2026-04-23T02:02:00.000Z',
    records: [
      {
        pageTitle: '配方',
        revisionTimestamp: '2026-04-22T11:04:00Z',
        fetchedAt: '2026-04-23T02:03:00.000Z',
      },
    ],
  });
  await writeJson(path.join(sharedDataRoot, 'normalized', 'item-relations.bundle.json'), {
    source: 'terraria.wiki.gg:item-page-assembly',
    generatedAt: '2026-04-23T02:04:00.000Z',
    itemImages: [],
  });

  const actual = await listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot });
  const datasetCounts = actual.reduce((accumulator, entry) => {
    accumulator[entry.datasetType] = (accumulator[entry.datasetType] ?? 0) + 1;
    return accumulator;
  }, {});

  assert.equal(datasetCounts.items_raw, 1);
  assert.equal(datasetCounts.npcs_raw, 1);
  assert.equal(datasetCounts.item_pages_raw, 2);
  assert.equal(datasetCounts.biomes_raw, 1);
  assert.equal(datasetCounts.armor_set_images_raw, 1);
  assert.equal(datasetCounts.bosses_raw, 2);
  assert.equal(datasetCounts.categories_raw, 2);
  assert.equal(datasetCounts.recipes_raw, 1);
  assert.equal(datasetCounts.item_relations_bundle_raw, 1);

  const itemPageEntry = actual.find((entry) => entry.datasetType === 'item_pages_raw' && entry.sourcePage === 'Zenith');
  assert.equal(itemPageEntry.provider, 'terraria.wiki.gg');
  assert.equal(itemPageEntry.sourceKind, 'page');
  assert.match(itemPageEntry.sourceLocator, /^shared:\/\//);
  assert.equal(itemPageEntry.parseStatus, 'ok');
  assert.equal(typeof itemPageEntry.contentHash, 'string');
  assert.equal(itemPageEntry.contentHash.length, 64);

  const npcEntry = actual.find((entry) => entry.datasetType === 'npcs_raw');
  assert.equal(npcEntry.provider, 'terrapedia.generated');
  assert.equal(npcEntry.sourceKind, 'generated_standardized_bridge');
  assert.equal(npcEntry.sourceLocator, 'repo://data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json');
});

test('listSourceDatasetLandingInputs prefers standardized buff records for buffs_raw landing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-buff-landing-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');

  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'template__getbuffinfo.parsed.latest.json'), {
    sourcePageTitle: 'Template:GetBuffInfo',
    fetchedAt: '2026-05-14T00:00:00.000Z',
    sourceRevisionTimestamp: '2026-05-13T00:00:00Z',
    buffs: [{ id: 1, internalName: 'OldBuff', name: 'Old Buff' }],
  });
  await writeJson(path.join(repoRoot, 'data', 'standardized', 'buffs.standardized.json'), {
    entity: 'buffs',
    generatedAt: '2026-05-15T00:00:00.000Z',
    records: [
      {
        id: 323,
        internalName: 'OnFire3',
        englishName: 'Hellfire',
        sourceEvidence: { pageTitle: 'Hellfire', parseStatus: 'parsed' },
      },
    ],
  });

  const actual = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot,
    datasets: ['buffs_raw'],
  });

  assert.equal(actual.length, 1);
  assert.equal(actual[0].datasetType, 'buffs_raw');
  assert.equal(actual[0].provider, 'terrapedia.generated');
  assert.equal(actual[0].sourceKind, 'generated_standardized');
  assert.equal(actual[0].sourceKey, 'generated.buffs.standardized');
  assert.equal(actual[0].sourcePage, 'buffs.standardized');
  assert.equal(actual[0].sourceLocator, 'repo://data/standardized/buffs.standardized.json');
  assert.equal(actual[0].fetchedAt, '2026-05-15T00:00:00.000Z');
  assert.equal(actual[0].parsedAt, '2026-05-15T00:00:00.000Z');
  assert.deepEqual((await actual[0].loadPayload()).records.map((record) => record.internalName), ['OnFire3']);
});

test('listSourceDatasetLandingInputs falls back to raw buff template when standardized file is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-buff-landing-fallback-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');

  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'template__getbuffinfo.parsed.latest.json'), {
    sourcePageTitle: 'Template:GetBuffInfo',
    fetchedAt: '2026-05-14T00:00:00.000Z',
    sourceRevisionTimestamp: '2026-05-13T00:00:00Z',
    buffs: [{ id: 1, internalName: 'OldBuff', name: 'Old Buff' }],
  });

  const actual = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot,
    datasets: ['buffs_raw'],
  });

  assert.equal(actual.length, 1);
  assert.equal(actual[0].datasetType, 'buffs_raw');
  assert.equal(actual[0].provider, 'terraria.wiki.gg');
  assert.equal(actual[0].sourceKind, 'template');
  assert.equal(actual[0].sourceKey, 'wiki.template.getbuffinfo');
  assert.equal(actual[0].sourcePage, 'Template:GetBuffInfo');
  assert.equal(actual[0].sourceLocator, 'shared://raw/wiki/template__getbuffinfo.parsed.latest.json');
  assert.equal(actual[0].fetchedAt, '2026-05-14T00:00:00.000Z');
  assert.equal(actual[0].parsedAt, '2026-05-14T00:00:00.000Z');
});

test('listSourceDatasetLandingInputs respects requested dataset filters', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-landing-filter-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');

  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'module__iteminfo__data.latest.json'), {
    moduleTitle: 'Module:Iteminfo/data',
    fetchedAt: '2026-04-23T01:00:00.000Z',
  });
  await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json'), {
    generatedAt: '2026-04-23T02:00:00.000Z',
    records: [{ pageTitle: '配方' }],
  });

  const actual = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot,
    datasets: ['recipes_raw'],
  });

  assert.equal(actual.length, 1);
  assert.equal(actual[0].datasetType, 'recipes_raw');
});
