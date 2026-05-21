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

function createFakeConnection() {
  const biomeIds = new Map([
    ['FOREST', 10],
    ['HALLOW', 11],
  ]);
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
        return [[...biomeIds.entries()].map(([code, id]) => ({ id, code }))];
      }
      if (/FROM items WHERE deleted = 0/i.test(sql)) {
        return [[...itemByInternal.values()]];
      }
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ method: 'execute', sql, params });
      if (/INSERT INTO biomes/i.test(sql)) {
        const code = String(params[0]).toUpperCase();
        if (!biomeIds.has(code)) {
          biomeIds.set(code, biomeIds.size + 10);
        }
        return [{ affectedRows: 1, insertId: biomeIds.get(code) }];
      }
      if (/FROM biome_resources/i.test(sql)) {
        return [[]];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}
