import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildBiomeImportPlan,
  importBiomeDataset,
  loadStandardizedBiomeRecords,
  mergeBiomeRecords,
  assertPrimaryDb,
  resolveMysqlRequireCandidates,
} from './import-biomes-to-db.mjs';

test('buildBiomeImportPlan merges standardized and wiki biomes without requiring unrelated relation parts', () => {
  const plan = buildBiomeImportPlan({
    standardizedBiomes: [
      {
        code: 'forest',
        nameEn: 'Forest',
        resources: [{ itemInternalName: 'Wood', itemName: 'Wood' }],
      },
    ],
    wikiBiomes: [
      {
        code: 'forest',
        nameEn: 'Forest',
        nameZh: '森林',
        sourcePage: 'Forest',
      },
      {
        code: 'aether',
        nameEn: 'Aether',
      },
    ],
    itemBiomes: [
      { itemInternalName: 'Wood', biomeCode: 'forest' },
    ],
    sourceFiles: {
      standardizedBiomesFile: 'data/standardized-view/item_relations/biomes/biomes.part-0001.json',
      wikiBiomesFile: 'data/generated/wiki-biomes.importable.latest.json',
      itemBiomesDir: 'data/standardized-view/item_relations/itemBiomes',
    },
  });

  assert.equal(plan.summary.biomes.input, 2);
  assert.equal(plan.summary.biomeResources.input, 1);
  assert.equal(plan.summary.itemBiomes.input, 1);
  assert.equal(plan.biomes.find((biome) => biome.code === 'forest').nameZh, '森林');
  assert.equal(plan.biomes.find((biome) => biome.code === 'aether').nameEn, 'Aether');
  assert.equal(plan.sourceFiles.itemBiomesDir, 'data/standardized-view/item_relations/itemBiomes');
});

test('mergeBiomeRecords lets generated wiki records override stale standardized fields by code', () => {
  const actual = mergeBiomeRecords(
    [{
      code: 'hallow',
      nameEn: 'Hallow',
      sourcePage: 'Old Hallow',
      iconUrl: 'https://example.invalid/hallow.png',
      resources: [{ resourceNameRaw: 'Pixie Dust', resourceType: 'material' }],
      relations: [{ relatedBiomeCode: 'underground_hallow', relationType: 'surface_to_underground' }],
    }],
    [{
      code: 'hallow',
      nameEn: 'The Hallow',
      nameZh: '神圣之地',
      iconUrl: null,
      resources: [],
      relations: [{ relatedBiomeCode: 'ice', relationType: 'infected_variant_source' }],
    }]
  );

  assert.deepEqual(actual, [
    {
      code: 'hallow',
      nameEn: 'The Hallow',
      sourcePage: 'Old Hallow',
      nameZh: '神圣之地',
      iconUrl: 'https://example.invalid/hallow.png',
      resources: [{ resourceNameRaw: 'Pixie Dust', resourceType: 'material' }],
      relations: [
        { relatedBiomeCode: 'underground_hallow', relationType: 'surface_to_underground' },
        { relatedBiomeCode: 'ice', relationType: 'infected_variant_source' },
      ],
    },
  ]);
});

test('mergeBiomeRecords drops stale platform marker icons when wiki has no valid replacement', () => {
  const actual = mergeBiomeRecords(
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: 'https://terraria.wiki.gg/images/Desktop_only.png',
    }],
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: null,
    }]
  );

  assert.equal(actual[0].iconUrl, null);
});

test('mergeBiomeRecords preserves valid existing icons when wiki has no replacement', () => {
  const actual = mergeBiomeRecords(
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: 'https://terraria.wiki.gg/images/Forest_biome.png',
    }],
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: '',
    }]
  );

  assert.equal(actual[0].iconUrl, 'https://terraria.wiki.gg/images/Forest_biome.png');
});

test('mergeBiomeRecords preserves existing managed biome images over wiki import icons', () => {
  const managedIcon = 'http://localhost:9000/terrapedia-images/items/wiki/biomes/c4/c4f9-forest.png';
  const actual = mergeBiomeRecords(
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: managedIcon,
    }],
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: 'https://terraria.wiki.gg/images/BiomeBannerForest.png',
    }]
  );

  assert.equal(actual[0].iconUrl, managedIcon);
});

test('mergeBiomeRecords replaces known stale managed biome placeholder images with wiki import icons', () => {
  const actual = mergeBiomeRecords(
    [{
      code: 'underground_cabin',
      nameEn: 'Underground Cabin',
      iconUrl: 'http://localhost:9000/terrapedia-images/items/2026/05/22/3c29b387d34e420c8920a5f39606ad07.png',
    }],
    [{
      code: 'underground_cabin',
      nameEn: 'Underground Cabin',
      iconUrl: 'https://terraria.wiki.gg/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png',
    }]
  );

  assert.equal(actual[0].iconUrl, 'https://terraria.wiki.gg/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png');
});

test('mergeBiomeRecords replaces known stale managed biome item icons with wiki import icons', () => {
  const actual = mergeBiomeRecords(
    [{
      code: 'meteorite',
      nameEn: 'Meteorite',
      iconUrl: 'http://localhost:9000/terrapedia-images/items/wiki/biomes/63/63785642f9d735cc393557b4e893749cf8dfa522-meteorite.png',
    }],
    [{
      code: 'meteorite',
      nameEn: 'Meteorite (biome)',
      iconUrl: 'https://terraria.wiki.gg/images/BiomeBannerMeteor.png',
    }]
  );

  assert.equal(actual[0].iconUrl, 'https://terraria.wiki.gg/images/BiomeBannerMeteor.png');
});

test('mergeBiomeRecords keeps managed biome images when incoming wiki icon is a platform marker', () => {
  const managedIcon = 'http://localhost:9000/terrapedia-images/items/wiki/biomes/c4/c4f9-forest.png';
  const actual = mergeBiomeRecords(
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: managedIcon,
    }],
    [{
      code: 'forest',
      nameEn: 'Forest',
      iconUrl: 'https://terraria.wiki.gg/images/Desktop_only.png',
    }]
  );

  assert.equal(actual[0].iconUrl, managedIcon);
});

test('loadStandardizedBiomeRecords combines standardized file with relation biome parts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-inputs-'));
  const dataDir = path.join(tempDir, 'standardized');
  const relationBiomesDir = path.join(tempDir, 'relations', 'biomes');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(relationBiomesDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'biomes.standardized.json'), JSON.stringify({
    records: [{ biomeCode: 'forest', pageTitle: 'Forest', revisionTimestamp: '2026-05-20T00:00:00Z' }],
  }), 'utf8');
  fs.writeFileSync(path.join(relationBiomesDir, 'biomes.part-0001.json'), JSON.stringify([
    {
      code: 'forest',
      nameEn: 'Forest',
      resources: [{ resourceNameRaw: 'Wood', resourceType: 'block' }],
    },
  ]), 'utf8');

  const actual = loadStandardizedBiomeRecords({
    dataDir,
    biomesFile: path.join(dataDir, 'biomes.standardized.json'),
    relationBiomesDir,
  });

  assert.equal(actual.length, 1);
  assert.equal(actual[0].pageTitle, 'Forest');
  assert.deepEqual(actual[0].resources, [{ resourceNameRaw: 'Wood', resourceType: 'block' }]);
});

test('importBiomeDataset applies only biome-owned tables', async () => {
  const conn = createFakeConnection();
  const plan = buildBiomeImportPlan({
    standardizedBiomes: [
      {
        code: 'forest',
        nameEn: 'Forest',
        relations: [{ relatedBiomeCode: 'hallow', relationType: 'counterpart' }],
        resources: [{ itemInternalName: 'Wood', itemName: 'Wood', resourceNameRaw: 'Wood' }],
      },
      { code: 'hallow', nameEn: 'The Hallow' },
    ],
    wikiBiomes: [],
    itemBiomes: [
      { itemInternalName: 'Wood', biomeCode: 'forest', relationType: 'found_in' },
      { itemInternalName: 'Missing', biomeCode: 'forest', relationType: 'found_in' },
    ],
  });

  const summary = await importBiomeDataset(conn, plan);

  assert.equal(summary.biomes.updated, 2);
  assert.equal(summary.biomeRelations.updated, 1);
  assert.equal(summary.biomeResources.created, 1);
  assert.equal(summary.itemBiomes.updated, 1);
  assert.equal(summary.itemBiomes.skipped, 1);

  const sql = conn.calls.map((call) => call.sql).join('\n');
  assert.match(sql, /\bINSERT INTO biomes\b/);
  assert.match(sql, /\bINSERT INTO biome_relations\b/);
  assert.match(sql, /\bINSERT INTO biome_resources\b/);
  assert.match(sql, /\bINSERT INTO item_biomes\b/);
  assert.doesNotMatch(sql, /\bINSERT INTO items\b|\bUPDATE items\b|\brecipes\b|\bitem_images\b|\bitem_acquisition_sources\b|\bcategory\b|\bentity_source_snapshots\b/);
});

test('importBiomeDataset preserves existing managed biome icon when incoming wiki icon is external', async () => {
  const managedIcon = 'http://localhost:9000/terrapedia-images/items/wiki/biomes/c4/c4f9-forest.png';
  const conn = createFakeConnection({
    biomeIds: [['FOREST', 10]],
    biomeIcons: [['FOREST', managedIcon]],
  });
  const plan = buildBiomeImportPlan({
    wikiBiomes: [
      {
        code: 'forest',
        nameEn: 'Forest',
        iconUrl: 'https://terraria.wiki.gg/images/BiomeBannerForest.png',
      },
    ],
  });

  await importBiomeDataset(conn, plan);

  const upsertCall = conn.calls.find((call) => call.method === 'execute' && /\bINSERT INTO biomes\b/.test(call.sql));
  assert.ok(upsertCall, 'expected biome upsert call');
  assert.equal(upsertCall.params[17], managedIcon);
});

test('importBiomeDataset replaces known stale managed biome icon when incoming wiki icon is external', async () => {
  const conn = createFakeConnection({
    biomeIds: [['UNDERGROUND_CABIN', 10]],
    biomeIcons: [['UNDERGROUND_CABIN', 'http://localhost:9000/terrapedia-images/items/2026/05/22/3c29b387d34e420c8920a5f39606ad07.png']],
  });
  const plan = buildBiomeImportPlan({
    wikiBiomes: [
      {
        code: 'underground_cabin',
        nameEn: 'Underground Cabin',
        iconUrl: 'https://terraria.wiki.gg/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png',
      },
    ],
  });

  await importBiomeDataset(conn, plan);

  const upsertCall = conn.calls.find((call) => call.method === 'execute' && /\bINSERT INTO biomes\b/.test(call.sql));
  assert.ok(upsertCall, 'expected biome upsert call');
  assert.equal(upsertCall.params[17], 'https://terraria.wiki.gg/images/thumb/Underground_Cabin.png/200px-Underground_Cabin.png');
});

test('importBiomeDataset persists wiki taxonomy columns while preserving managed image fallback behavior', async () => {
  const conn = createFakeConnection({
    biomeIds: [['SPIKE_CAVES', 10]],
    biomeIcons: [['SPIKE_CAVES', null]],
  });
  const plan = buildBiomeImportPlan({
    wikiBiomes: [
      {
        code: 'spike_caves',
        nameEn: 'Spike Caves',
        nameZh: '尖刺洞穴',
        layerType: 'micro_biome',
        biomeType: 'micro_biome',
        wikiGroupCode: 'spike_caves',
        wikiGroupNameEn: 'Spike Caves',
        wikiGroupNameZh: '尖刺洞穴',
        wikiParentGroupCode: 'micro_biomes',
        wikiParentGroupNameEn: 'Micro-biomes',
        wikiParentGroupNameZh: '微型群系',
        wikiSectionLevel: 3,
        wikiSortOrder: 44,
        wikiSectionAnchor: 'Spike_Caves',
        sourcePage: 'Biomes#Spike_Caves',
      },
    ],
  });

  await importBiomeDataset(conn, plan);

  const insert = conn.calls.find((call) => call.method === 'execute' && /INSERT INTO biomes/i.test(call.sql));
  assert.ok(insert, 'expected biome upsert call');
  assert.match(insert.sql, /wiki_group_code/);
  assert.match(insert.sql, /wiki_parent_group_code/);
  assert.match(insert.sql, /wiki_sort_order/);
  assert.ok(insert.params.includes('spike_caves'));
  assert.ok(insert.params.includes('micro_biomes'));
  assert.ok(insert.params.includes(44));
});

test('importBiomeDataset soft-deletes stale wiki overview fallback biome rows', async () => {
  const conn = createFakeConnection({
    biomeIds: [
      ['FOREST', 10],
      ['BIOMES', 12],
      ['STONE_BLOCK', 13],
    ],
  });
  const plan = buildBiomeImportPlan({
    wikiBiomes: [
      {
        code: 'forest',
        nameEn: 'Forest',
        sourceProvider: 'wiki_gg',
        sourcePage: 'Forest',
      },
    ],
  });

  const summary = await importBiomeDataset(conn, plan);

  const cleanupCall = conn.calls.find((call) => (
    call.method === 'execute'
    && /\bUPDATE biomes\b/i.test(call.sql)
    && /source_provider\s*=\s*'wiki_gg'/i.test(call.sql)
    && /LOWER\(code\)\s+NOT IN/i.test(call.sql)
  ));
  assert.ok(cleanupCall, 'expected stale overview fallback cleanup query');
  assert.deepEqual(cleanupCall.params, ['forest']);
  assert.equal(summary.staleBiomes.updated, 2);
});

test('assertPrimaryDb blocks non-primary writes unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_local', false));
  assert.throws(
    () => assertPrimaryDb('terria_v1_maint', false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true));
});

test('resolveMysqlRequireCandidates includes data-query-app package manifests', () => {
  const candidates = resolveMysqlRequireCandidates();
  assert.ok(candidates.some((candidate) => String(candidate).endsWith('data-query-app/package.json')));
});

function createFakeConnection({
  biomeIds: initialBiomeIds = [
    ['FOREST', 10],
    ['HALLOW', 11],
  ],
  biomeIcons: initialBiomeIcons = [],
} = {}) {
  const biomeIds = new Map(initialBiomeIds);
  const biomeIcons = new Map(initialBiomeIcons);
  const itemByInternal = new Map([
    ['WOOD', {
      id: 20,
      internal_name: 'Wood',
      name: 'Wood',
      name_zh: '木材',
    }],
  ]);
  const calls = [];

  return {
    calls,
    async query(sql) {
      calls.push({ method: 'query', sql });
      if (/FROM biomes WHERE deleted = 0/i.test(sql)) {
        return [[...biomeIds.entries()].map(([code, id]) => ({
          id,
          code,
          icon_url: biomeIcons.get(code) ?? null,
        }))];
      }
      if (/FROM items WHERE deleted = 0/i.test(sql)) {
        return [[...itemByInternal.values()]];
      }
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ method: 'execute', sql, params });
      if (/UPDATE biomes/i.test(sql) && /code\s*=\s*'biomes'/i.test(sql)) {
        const affectedRows = biomeIds.has('BIOMES') ? 1 : 0;
        biomeIds.delete('BIOMES');
        return [{ affectedRows }];
      }
      if (/UPDATE biomes/i.test(sql) && /LOWER\(code\)\s+NOT IN/i.test(sql)) {
        const keptCodes = new Set(params.map((value) => String(value).toUpperCase()));
        let affectedRows = 0;
        for (const code of [...biomeIds.keys()]) {
          if (!keptCodes.has(code)) {
            biomeIds.delete(code);
            affectedRows += 1;
          }
        }
        return [{ affectedRows }];
      }
      if (/INSERT INTO biomes/i.test(sql)) {
        const code = String(params[0]).toUpperCase();
        if (!biomeIds.has(code)) {
          biomeIds.set(code, biomeIds.size + 10);
        }
        biomeIcons.set(code, params[17] ?? null);
        return [{ affectedRows: 1, insertId: biomeIds.get(code) }];
      }
      if (/FROM biome_resources/i.test(sql)) {
        return [[]];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}
