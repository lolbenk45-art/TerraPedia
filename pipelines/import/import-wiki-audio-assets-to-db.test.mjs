import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertPrimaryDb,
  buildAudioAssetRows,
  buildAudioLinkRows,
  parseArgs,
  resolveImportOptions,
  runAudioAssetImport,
  validateAudioMetadata
} from './import-wiki-audio-assets-to-db.mjs';

test('parseArgs parses apply and database options', () => {
  assert.deepEqual(parseArgs([
    '--apply=true',
    '--database=terria_v1_local',
    '--allow-non-primary-db'
  ]), {
    apply: 'true',
    database: 'terria_v1_local',
    'allow-non-primary-db': 'true'
  });
});

test('resolveImportOptions defaults to dry-run and latest audio metadata path', () => {
  const options = resolveImportOptions({}, {
    repoRoot: '/repo',
    env: {},
    now: new Date('2026-06-02T01:00:00.000Z')
  });

  assert.equal(options.apply, false);
  assert.equal(options.db.database, 'terria_v1_local');
  assert.equal(options.inputJsonPath, '/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json');
  assert.equal(options.reportPath, path.resolve('/repo', 'reports/audio-db-import-dry-run-2026-06-02.json'));
});

test('assertPrimaryDb blocks non-primary apply writes', () => {
  assert.throws(
    () => assertPrimaryDb('terria_v1_maint', true, false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', false, false));
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true, true));
});

test('validateAudioMetadata accepts a valid asset and reports summary', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-valid-'));
  const filePath = path.join(tempDir, 'item.wav');
  fs.writeFileSync(filePath, 'item-one');
  const metadata = { assets: [asset({ absoluteLocalPath: filePath, size: 8, sha256: sha256('item-one') })] };

  const result = validateAudioMetadata(metadata);

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.valid, 1);
  assert.equal(result.summary.invalid, 0);
  assert.equal(result.failures.length, 0);
});

test('validateAudioMetadata rejects missing assets array', () => {
  assert.throws(() => validateAudioMetadata({}), /assets array/);
});

test('validateAudioMetadata reports duplicate asset ids and missing hashes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-invalid-'));
  const filePath = path.join(tempDir, 'item.wav');
  fs.writeFileSync(filePath, 'item-one');
  const metadata = {
    assets: [
      asset({ assetId: 'items:item-1', absoluteLocalPath: filePath, size: 8, sha256: null }),
      asset({ assetId: 'items:item-1', absoluteLocalPath: filePath, size: 8, sha256: sha256('item-one') })
    ]
  };

  const result = validateAudioMetadata(metadata);

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.valid, 0);
  assert.equal(result.summary.invalid, 2);
  assert.ok(result.failures.some((failure) => failure.reason.includes('missing sha256')));
  assert.ok(result.failures.some((failure) => failure.reason.includes('duplicate assetId')));
});

test('validateAudioMetadata reports missing files and size mismatches', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-size-'));
  const filePath = path.join(tempDir, 'item.wav');
  fs.writeFileSync(filePath, 'item-one');
  const metadata = {
    assets: [
      asset({ assetId: 'items:item-1', absoluteLocalPath: filePath, size: 99, sha256: sha256('item-one') }),
      asset({ assetId: 'items:item-2', absoluteLocalPath: path.join(tempDir, 'missing.wav'), size: 8, sha256: sha256('item-one') })
    ]
  };

  const result = validateAudioMetadata(metadata);

  assert.equal(result.summary.valid, 0);
  assert.ok(result.failures.some((failure) => failure.reason.includes('size mismatch')));
  assert.ok(result.failures.some((failure) => failure.reason.includes('local file missing')));
});

test('buildAudioLinkRows creates conservative shard links', async () => {
  const rows = buildAudioLinkRows([
    asset({ assetId: 'bgm:music-aether', shard: 'bgm', sourceKey: 'Music-Aether' }),
    asset({ assetId: 'items:item-1', shard: 'items', sourceKey: 'Item_1' }),
    asset({ assetId: 'npc_hit:npc-hit-1', shard: 'npc_hit', sourceKey: 'NPC_Hit_1' }),
    asset({ assetId: 'npc_death:npc-killed-1', shard: 'npc_death', sourceKey: 'NPC_Killed_1' })
  ]);

  assert.deepEqual(rows.map((row) => [row.entityType, row.relationType, row.matchStatus]), [
    ['bgm_track', 'bgm_track', 'unmatched'],
    ['item', 'item_use_sound', 'unmatched'],
    ['npc_sound_family', 'npc_hit_sound', 'unmatched'],
    ['npc_sound_family', 'npc_death_sound', 'unmatched']
  ]);
});

test('buildAudioLinkRows matches item source id exactly', () => {
  const rows = buildAudioLinkRows(
    [asset({ assetId: 'items:item-1', shard: 'items', sourceKey: 'Item_1' })],
    [{ id: 1001, source_id: 1, internal_name: 'Item_1' }]
  );

  assert.deepEqual(rows[0], {
    assetId: 'items:item-1',
    entityType: 'item',
    entityId: 1001,
    sourceKey: 'Item_1',
    relationType: 'item_use_sound',
    matchStatus: 'matched',
    matchReason: 'matched items.source_id from Item_1',
    sortOrder: 0
  });
});

test('buildAudioLinkRows marks ambiguous item matches', () => {
  const rows = buildAudioLinkRows(
    [asset({ assetId: 'items:item-1', shard: 'items', sourceKey: 'Item_1' })],
    [
      { id: 1001, source_id: 1, internal_name: 'Item_1' },
      { id: 1002, source_id: 1, internal_name: 'Item_One' }
    ]
  );

  assert.equal(rows[0].matchStatus, 'ambiguous');
  assert.equal(rows[0].entityId, null);
});

test('buildAudioAssetRows maps metadata fields to db rows', () => {
  const rows = buildAudioAssetRows([asset({
    assetId: 'items:item-1',
    sourceKey: 'Item_1',
    displayNameZh: '铁镐',
    displayNameEn: 'Iron Pickaxe'
  })], {
    reportPath: 'reports/audio-db-import.json'
  });

  assert.equal(rows[0].assetId, 'items:item-1');
  assert.equal(rows[0].displayNameZh, '铁镐');
  assert.equal(rows[0].displayNameEn, 'Iron Pickaxe');
  assert.equal(rows[0].sizeBytes, 8);
  assert.equal(rows[0].provider, 'wiki_gg');
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].crawlReportPath, 'reports/audio-db-import.json');
});

test('buildAudioAssetRows can enrich item audio names from item rows', () => {
  const rows = buildAudioAssetRows(
    [asset({ assetId: 'items:item-1', shard: 'items', sourceKey: 'Item_1' })],
    {
      itemRows: [
        { id: 1001, source_id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐' }
      ]
    }
  );

  assert.equal(rows[0].displayNameZh, '铁镐');
  assert.equal(rows[0].displayNameEn, 'Iron Pickaxe');
});

test('buildAudioAssetRows can enrich BGM names from BGM display name rows', () => {
  const rows = buildAudioAssetRows(
    [
      asset({ assetId: 'bgm:music-aether', shard: 'bgm', sourceKey: 'Music-Aether' }),
      asset({ assetId: 'bgm:music-boss-5', shard: 'bgm', sourceKey: 'Music-Boss_5' })
    ],
    {
      bgmDisplayNameRows: [
        { sourceKey: 'Music-Aether', displayNameZh: '以太', displayNameEn: 'Aether' },
        { sourceKey: 'Music-Boss_5', displayNameZh: 'Boss 5', displayNameEn: 'Boss 5' }
      ]
    }
  );

  assert.equal(rows[0].displayNameZh, '以太');
  assert.equal(rows[0].displayNameEn, 'Aether');
  assert.equal(rows[1].displayNameZh, 'Boss 5');
  assert.equal(rows[1].displayNameEn, 'Boss 5');
});

test('buildAudioAssetRows can enrich npc sound family display names from npc rows', () => {
  const rows = buildAudioAssetRows(
    [asset({ assetId: 'npc_hit:npc-hit-1', shard: 'npc_hit', sourceKey: 'NPC_Hit_1' })],
    {
      npcRows: [
        { id: 2001, internal_name: 'Hornet', name: 'Hornet', name_zh: '黄蜂', raw_json: JSON.stringify({ extras: { HitSound: 'NPC_Hit_1' } }) },
        { id: 2002, internal_name: 'RainZombie', name: 'Zombie', name_zh: '僵尸', raw_json: JSON.stringify({ extras: { HitSound: 'NPC_Hit_1' } }) },
        { id: 2003, internal_name: 'BlueSlime', name: 'Blue Slime', name_zh: '蓝史莱姆', raw_json: JSON.stringify({ extras: { HitSound: 'NPC_Hit_1, NPC_Hit_2' } }) }
      ]
    }
  );

  assert.equal(rows[0].displayNameZh, '音效族：黄蜂、僵尸、蓝史莱姆 (3 NPC)');
  assert.equal(rows[0].displayNameEn, 'Sound family: Hornet, Zombie, Blue Slime (3 NPC)');
});

test('runAudioAssetImport skips db connection in dry-run mode', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-dry-run-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  const reportPath = path.join(tempDir, 'report.json');
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })] }));
  let createConnectionCalled = false;

  const report = await runAudioAssetImport({
    apply: false,
    inputJsonPath: inputPath,
    reportPath,
    db: { database: 'terria_v1_local' }
  }, {
    mysqlModule: {
      async createConnection() {
        createConnectionCalled = true;
        throw new Error('dry-run should not connect');
      }
    }
  });

  assert.equal(createConnectionCalled, false);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.wouldInsertAssets, 1);
  assert.equal(report.summary.displayNameZhAssets, 1);
  assert.equal(report.summary.displayNameEnAssets, 1);
  assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).mode, 'dry-run');
});

test('runAudioAssetImport enriches dry-run display names from local standardized files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-local-data-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  const reportPath = path.join(tempDir, 'report.json');
  const itemStandardizedPath = path.join(tempDir, 'items.standardized.json');
  const itemZhMapPath = path.join(tempDir, 'item-zh-map.json');
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })] }));
  fs.writeFileSync(itemStandardizedPath, JSON.stringify({
    records: [{ id: 1, internalName: 'IronPickaxe', name: 'Iron Pickaxe' }]
  }));
  fs.writeFileSync(itemZhMapPath, JSON.stringify({
    records: { IronPickaxe: { internalName: 'IronPickaxe', nameZh: '铁镐' } }
  }));

  const report = await runAudioAssetImport({
    apply: false,
    inputJsonPath: inputPath,
    reportPath,
    db: { database: 'terria_v1_local' }
  }, {
    localDataOptions: {
      items: { standardizedPath: itemStandardizedPath, zhMapPath: itemZhMapPath },
      npcs: { standardizedPath: path.join(tempDir, 'missing-npcs.json'), zhMapPath: path.join(tempDir, 'missing-npc-zh.json') }
    }
  });

  assert.equal(report.samples[0].displayNameZh, '铁镐');
  assert.equal(report.samples[0].displayNameEn, 'Iron Pickaxe');
  assert.equal(report.summary.displayNameZhAssets, 1);
  assert.equal(report.summary.displayNameEnAssets, 1);
});

test('runAudioAssetImport applies idempotent upserts', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-apply-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })] }));
  const executeCalls = [];
  let ended = false;

  const report = await runAudioAssetImport({
    apply: true,
    inputJsonPath: inputPath,
    reportPath: null,
    db: { database: 'terria_v1_local' }
  }, {
    localItemRows: [],
    localNpcRows: [],
    mysqlModule: {
      async createConnection() {
        return {
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          async execute(sql, params) {
            executeCalls.push({ sql, params });
            if (sql.startsWith('SELECT id, source_id, internal_name, name, name_zh FROM items')) {
              return [[{ id: 1001, source_id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐' }]];
            }
            if (sql.startsWith('SELECT id, internal_name, name, name_zh, raw_json FROM npcs')) {
              return [[]];
            }
            if (sql.startsWith('SELECT id FROM audio_assets WHERE asset_id')) {
              return [[]];
            }
            if (sql.startsWith('SELECT id FROM audio_asset_links')) {
              return [[]];
            }
            if (sql.startsWith('SELECT id, asset_id FROM audio_assets WHERE asset_id IN')) {
              return [[{ id: 77, asset_id: 'items:item-1' }]];
            }
            return [{ affectedRows: 1 }];
          },
          async end() { ended = true; }
        };
      }
    }
  });

  assert.equal(ended, true);
  assert.equal(report.mode, 'apply');
  assert.equal(report.summary.insertedAssets, 1);
  assert.equal(report.summary.insertedLinks, 1);
  assert.ok(executeCalls.some((call) => call.sql.startsWith('INSERT INTO audio_assets')));
  const assetInsert = executeCalls.find((call) => call.sql.startsWith('INSERT INTO audio_assets'));
  assert.match(assetInsert.sql, /display_name_zh, display_name_en/);
  assert.ok(assetInsert.params.includes('铁镐'));
  assert.ok(assetInsert.params.includes('Iron Pickaxe'));
  assert.ok(executeCalls.some((call) => call.sql.startsWith('INSERT INTO audio_asset_links')));
});

test('runAudioAssetImport skips unchanged audio asset and link rows', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-skip-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  const inputAsset = asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') });
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [inputAsset] }));
  const executeCalls = [];

  const report = await runAudioAssetImport({
    apply: true,
    inputJsonPath: inputPath,
    reportPath: null,
    db: { database: 'terria_v1_local' }
  }, {
    localItemRows: [{ id: 1001, source_id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐' }],
    localNpcRows: [],
    mysqlModule: {
      async createConnection() {
        return {
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          async execute(sql, params = []) {
            executeCalls.push({ sql, params });
            if (sql.startsWith('SELECT id, source_id, internal_name, name, name_zh FROM items')) {
              return [[{ id: 1001, source_id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐' }]];
            }
            if (sql.startsWith('SELECT id, internal_name, name, name_zh, raw_json FROM npcs')) {
              return [[]];
            }
            if (sql.startsWith('SELECT id, asset_id FROM audio_assets WHERE asset_id IN')) {
              return [[{ id: 77, asset_id: 'items:item-1' }]];
            }
            if (sql.startsWith('SELECT id,') && sql.includes('FROM audio_assets') && sql.includes('WHERE asset_id = ?')) {
              return [[existingAudioAssetRow(inputAsset, { id: 77, reportPath: null })]];
            }
            if (sql.startsWith('SELECT id,') && sql.includes('FROM audio_asset_links')) {
              return [[existingAudioLinkRow({ id: 88, audioAssetId: 77 })]];
            }
            return [{ affectedRows: 1 }];
          },
          async end() {}
        };
      }
    }
  });

  assert.equal(report.summary.skippedAssets, 1);
  assert.equal(report.summary.skippedLinks, 1);
  assert.equal(report.summary.updatedAssets, 0);
  assert.equal(report.summary.updatedLinks, 0);
  assert.equal(executeCalls.some((call) => call.sql.startsWith('INSERT INTO audio_assets')), false);
  assert.equal(executeCalls.some((call) => call.sql.startsWith('INSERT INTO audio_asset_links')), false);
});

test('runAudioAssetImport falls back when items source_id column is absent', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-no-source-id-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })] }));
  const executeCalls = [];

  const report = await runAudioAssetImport({
    apply: true,
    inputJsonPath: inputPath,
    reportPath: null,
    db: { database: 'terria_v1_local' }
  }, {
    localItemRows: [{ id: 1, source_id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐' }],
    localNpcRows: [],
    mysqlModule: {
      async createConnection() {
        return {
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          async execute(sql) {
            executeCalls.push(sql);
            if (sql.startsWith('SELECT id, source_id, internal_name, name, name_zh FROM items')) {
              const error = new Error("Unknown column 'source_id' in 'field list'");
              error.code = 'ER_BAD_FIELD_ERROR';
              throw error;
            }
            if (sql.startsWith('SELECT id, internal_name, name, name_zh FROM items')) {
              return [[{ id: 1001, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: null }]];
            }
            if (sql.startsWith('SELECT id, internal_name, name, name_zh, raw_json FROM npcs')) {
              return [[]];
            }
            if (sql.startsWith('SELECT id FROM audio_assets WHERE asset_id')) {
              return [[]];
            }
            if (sql.startsWith('SELECT id, asset_id FROM audio_assets WHERE asset_id IN')) {
              return [[{ id: 77, asset_id: 'items:item-1' }]];
            }
            if (sql.startsWith('SELECT id FROM audio_asset_links')) {
              return [[]];
            }
            return [{ affectedRows: 1 }];
          },
          async end() {}
        };
      }
    }
  });

  assert.equal(report.summary.insertedAssets, 1);
  assert.equal(report.summary.insertedLinks, 1);
  assert.ok(executeCalls.some((sql) => sql.startsWith('SELECT id, internal_name, name, name_zh FROM items')));
  assert.equal(report.summary.matched, 1);
});

test('runAudioAssetImport leaves a caller-owned transaction open', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-import-caller-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({
    assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })]
  }));
  const lifecycle = [];
  const connection = {
    async beginTransaction() { lifecycle.push('begin'); },
    async commit() { lifecycle.push('commit'); },
    async rollback() { lifecycle.push('rollback'); },
    async end() { lifecycle.push('end'); },
    async execute(sql) {
      if (sql.startsWith('SELECT id, source_id, internal_name, name, name_zh FROM items')) return [[]];
      if (sql.startsWith('SELECT id, internal_name, name, name_zh, raw_json FROM npcs')) return [[]];
      if (sql.startsWith('SELECT id FROM audio_assets WHERE asset_id')) return [[]];
      if (sql.startsWith('SELECT id, asset_id FROM audio_assets WHERE asset_id IN')) {
        return [[{ id: 77, asset_id: 'items:item-1' }]];
      }
      if (sql.startsWith('SELECT id FROM audio_asset_links')) return [[]];
      return [{ affectedRows: 1 }];
    },
  };

  const report = await runAudioAssetImport({
    apply: true,
    inputJsonPath: inputPath,
    reportPath: null,
    db: { database: 'terria_v1_local' },
  }, {
    connection,
    transactionOwner: 'caller',
    localItemRows: [],
    localNpcRows: [],
  });

  assert.equal(report.summary.insertedAssets, 1);
  assert.deepEqual(lifecycle, []);
});

function asset(overrides = {}) {
  return {
    assetId: 'items:item-1',
    shard: 'items',
    scope: 'items',
    kind: 'item_sound',
    sourceKey: 'Item_1',
    fileTitle: 'File:Item_1.wav',
    wikiFileUrl: 'https://terraria.wiki.gg/wiki/File:Item_1.wav',
    sourceUrl: 'https://terraria.wiki.gg/images/Item_1.wav',
    localPath: 'data/terraPedia/media/audio/wiki/items/item-1.wav',
    absoluteLocalPath: '/tmp/item-1.wav',
    mime: 'audio/wav',
    size: 8,
    sha256: sha256('item-one'),
    ...overrides
  };
}

function existingAudioAssetRow(inputAsset, { id, reportPath }) {
  return {
    id,
    asset_id: inputAsset.assetId,
    shard: inputAsset.shard,
    kind: inputAsset.kind,
    source_key: inputAsset.sourceKey,
    display_name_zh: '铁镐',
    display_name_en: 'Iron Pickaxe',
    file_title: inputAsset.fileTitle,
    wiki_file_url: inputAsset.wikiFileUrl,
    source_url: inputAsset.sourceUrl,
    local_path: inputAsset.localPath,
    absolute_local_path: inputAsset.absoluteLocalPath,
    mime: inputAsset.mime,
    size_bytes: inputAsset.size,
    sha256: inputAsset.sha256,
    provider: 'wiki_gg',
    status: 'active',
    last_verified_at: null,
    crawl_report_path: reportPath,
    raw_json: JSON.stringify(inputAsset),
    deleted: 0,
  };
}

function existingAudioLinkRow({ id, audioAssetId }) {
  return {
    id,
    audio_asset_id: audioAssetId,
    entity_type: 'item',
    entity_id: 1001,
    source_key: 'Item_1',
    relation_type: 'item_use_sound',
    match_status: 'matched',
    match_reason: 'matched items.source_id from Item_1',
    sort_order: 0,
    deleted: 0,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
