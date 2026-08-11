import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
  await writeJson(path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'), {
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
  await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-armor-attributes.latest.json'), {
    source: 'terraria.wiki.gg/zh/wiki/盔甲属性表',
    sourceApi: 'https://terraria.wiki.gg/zh/api.php',
    sourcePageTitle: '盔甲属性表',
    sourceRevisionTimestamp: '2026-05-30T00:00:00Z',
    generatedAt: '2026-05-30T00:00:00Z',
    total: 1,
    records: [{
      itemNameZh: '神圣面具',
      itemPageTitle: '神圣面具',
      slotGroup: 'head',
      defenseValue: 24,
      rawCells: { meleeDamage: '10%', meleeCritChance: '10%', classSpecific: '10%' },
    }],
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
  assert.equal(datasetCounts.npcs_base_raw, 1);
  assert.equal(datasetCounts.npcs_raw, undefined);
  assert.equal(datasetCounts.item_pages_raw, 2);
  assert.equal(datasetCounts.biomes_raw, 1);
  assert.equal(datasetCounts.armor_set_images_raw, 1);
  assert.equal(datasetCounts.armor_attributes_raw, 1);
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

  const npcEntry = actual.find((entry) => entry.datasetType === 'npcs_base_raw');
  assert.equal(npcEntry.provider, 'terrapedia.standardized');
  assert.equal(npcEntry.sourceKind, 'standardized_dataset');
  assert.equal(npcEntry.sourceKey, 'standardized.npcs');
  assert.equal(npcEntry.sourceLocator, 'repo://data/standardized/npcs.standardized.json');

  const armorAttributesEntry = actual.find((entry) => entry.datasetType === 'armor_attributes_raw');
  assert.equal(armorAttributesEntry.provider, 'terraria.wiki.gg');
  assert.equal(armorAttributesEntry.sourceKind, 'page_table');
  assert.equal(armorAttributesEntry.sourceKey, 'wiki.page.armor_attributes');
  assert.equal(armorAttributesEntry.sourcePage, '盔甲属性表');
  assert.equal(armorAttributesEntry.sourceLocator, 'repo://data/generated/wiki-armor-attributes.latest.json');
  assert.equal(armorAttributesEntry.sourceRevisionTimestamp, '2026-05-30T00:00:00Z');
  assert.equal(armorAttributesEntry.fetchedAt, '2026-05-30T00:00:00Z');
  assert.equal(armorAttributesEntry.parsedAt, '2026-05-30T00:00:00Z');
  assert.equal(armorAttributesEntry.parseStatus, 'ok');
  assert.equal(typeof armorAttributesEntry.contentHash, 'string');
  assert.equal(armorAttributesEntry.contentHash.length, 64);
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

test('listSourceDatasetLandingInputs fails loudly when a required base dataset input is absent', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-landing-missing-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.mkdir(sharedDataRoot, { recursive: true });

  await assert.rejects(
    () => listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot, datasets: ['npcs_base_raw'] }),
    /npcs_base_raw requires an accepted landing source/,
  );
});

test('listSourceDatasetLandingInputs requires paired immutable NPC crawler evidence', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-npc-facts-landing-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  const normalizedPath = path.join(repoRoot, 'data', 'wiki-crawler', 'normalized-light', 'npc', 'medusa.latest.json');
  const auditPath = path.join(repoRoot, 'data', 'wiki-crawler', 'audit', 'npc', 'medusa.latest.json');
  const normalized = {
    entityId: 'medusa',
    source: { pageTitle: 'Medusa' },
    sourceMetadata: {
      revisionTimestamp: '2026-07-27T01:00:00Z',
      fetchedAt: '2026-07-27T01:01:00Z',
      parsedAt: '2026-07-27T01:02:00Z',
    },
    buffInflictions: [{ buffName: 'Stoned' }],
    shop: { normalizedRows: [] },
    loot: [{ itemName: 'Medusa Head' }],
  };
  const normalizedContentHash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

  await writeJson(normalizedPath, normalized);
  await assert.rejects(
    () => listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot, datasets: ['npc_crawler_facts_raw', 'item_image_sources_raw'] }),
    /matching audit evidence/i,
  );

  await writeJson(auditPath, {
    status: 'pass',
    entityId: 'medusa',
    sourcePage: 'Medusa',
    sourceRevisionTimestamp: '2026-07-27T01:00:00Z',
    normalizedContentHash,
    auditedAt: '2026-07-27T01:03:00Z',
    reasons: [],
  });
  const entries = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot,
    datasets: ['npc_crawler_facts_raw', 'item_image_sources_raw'],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].datasetType, 'npc_crawler_facts_raw');
  assert.equal(entries[0].provider, 'terraria.wiki.gg');
  assert.equal(entries[0].sourceKind, 'npc_crawler_fact');
  assert.equal(entries[0].sourceKey, 'wiki.npc.crawler_fact:medusa');
  assert.equal(entries[0].sourcePage, 'Medusa');
  assert.equal(entries[0].sourceRevisionTimestamp, '2026-07-27T01:00:00Z');
  assert.equal(entries[0].parseStatus, 'ok');
  assert.equal(entries[0].payload.normalized.entityId, 'medusa');
  assert.equal(entries[0].payload.audit.status, 'pass');
});

test('listSourceDatasetLandingInputs rejects oversized NPC fact counts before reading files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-npc-fact-count-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  const normalizedDir = path.join(repoRoot, 'data', 'wiki-crawler', 'normalized-light', 'npc');
  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(sharedDataRoot, { recursive: true });
  await Promise.all(Array.from({ length: 2049 }, (_, index) => (
    fs.writeFile(path.join(normalizedDir, `${String(index).padStart(4, '0')}.latest.json`), '')
  )));

  await assert.rejects(
    () => listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot, datasets: ['npc_crawler_facts_raw', 'item_image_sources_raw'] }),
    /2,048 facts per run/i,
  );
});

test('listSourceDatasetLandingInputs still skips optional datasets that are absent', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-landing-optional-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.mkdir(sharedDataRoot, { recursive: true });

  const actual = await listSourceDatasetLandingInputs({ repoRoot, sharedDataRoot, datasets: ['projectiles_raw'] });
  assert.deepEqual(actual, []);
});

test('listSourceDatasetLandingInputs emits governed group-only bootstrap descriptors with full-file lineage', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-group-landing-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  const generatedDir = path.join(repoRoot, 'data', 'generated');
  const recipeReference = {
    generatedAt: '2026-07-27T10:00:00.000Z',
    groups: [{
      canonicalName: 'Any Wood',
      displayNameEn: 'Any Wood',
      displayNameZh: 'any wood',
      members: [
        { internalName: 'Wood', name: 'Wood', nameZh: null },
        { internalName: 'Wood', name: 'Wood', nameZh: 'wood' },
      ],
    }],
    supplementalRecipes: [{ resultInternalName: 'Workbench' }],
  };
  const recipeOverrides = {
    schemaVersion: '1.0.0',
    updatedAt: '2026-07-27T10:00:01.000Z',
    groups: [{
      canonicalName: 'Any Wood',
      members: [{ internalName: 'Wood', name: 'Wood', nameZh: 'wood' }],
    }],
  };
  const itemOverrides = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-27T10:00:02.000Z',
    sourceProvider: 'wiki_gg',
    groups: [{
      canonicalName: 'Any Pylon',
      displayNameEn: 'Any Pylon',
      displayNameZh: 'any pylon',
      aliases: ['Any Teleportation Pylon'],
      sourceKind: 'curated_wiki_item_group',
      sourceProvider: 'wiki_gg',
      sourcePage: 'https://terraria.wiki.gg/wiki/Pylons',
      members: [{ internalName: 'ForestPylon', name: 'Forest Pylon', nameZh: 'forest pylon' }],
    }],
    blockedGroups: [{
      canonicalName: 'Recorded Music Boxes',
      displayNameEn: 'Recorded Music Boxes',
      displayNameZh: 'recorded music boxes',
      sourceKind: 'blocked_consumer_reference',
      sourceProvider: 'wiki_gg',
      sourcePage: 'https://terraria.wiki.gg/wiki/Shimmer',
      blockReason: 'members not proven',
    }],
  };

  await writeJson(path.join(generatedDir, 'recipe-material-reference.json'), recipeReference);
  await writeJson(path.join(generatedDir, 'recipe-group-overrides.json'), recipeOverrides);
  await writeJson(path.join(generatedDir, 'item-group-overrides.json'), itemOverrides);

  const actual = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot,
    datasets: ['item_groups_raw'],
    producerRunKey: 'locator-bootstrap-run',
  });

  assert.equal(actual.length, 4);
  assert.deepEqual(actual.map((entry) => entry.sourceKey).sort(), [
    'admin.item_group_overrides',
    'admin.recipe_group_overrides',
    'wiki.recipe_material_groups',
    'wiki.shimmer_item_groups',
  ]);
  const recipeEntry = actual.find((entry) => entry.sourceKey === 'wiki.recipe_material_groups');
  const rawRecipeReference = await fs.readFile(
    path.join(generatedDir, 'recipe-material-reference.json'),
    'utf8',
  );
  assert.equal(recipeEntry.fullFileByteSize, Buffer.byteLength(rawRecipeReference, 'utf8'));
  assert.equal(
    recipeEntry.fullFileContentHash,
    crypto.createHash('sha256').update(rawRecipeReference).digest('hex'),
  );
  assert.deepEqual(Object.keys(recipeEntry.payload), ['groups']);
  assert.equal(recipeEntry.payload.groups[0].members[0].nameZh, 'wood');
  assert.equal(recipeEntry.artifactRole, 'bootstrap_input');
  assert.equal(recipeEntry.producerRunKey, 'locator-bootstrap-run');
  assert.match(recipeEntry.bootstrapManifestHash, /^[a-f0-9]{64}$/);
});
