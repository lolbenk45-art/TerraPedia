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
  const rows = buildAudioAssetRows([asset({ assetId: 'items:item-1', sourceKey: 'Item_1' })], {
    reportPath: 'reports/audio-db-import.json'
  });

  assert.equal(rows[0].assetId, 'items:item-1');
  assert.equal(rows[0].sizeBytes, 8);
  assert.equal(rows[0].provider, 'wiki_gg');
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].crawlReportPath, 'reports/audio-db-import.json');
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
  assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).mode, 'dry-run');
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
    mysqlModule: {
      async createConnection() {
        return {
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          async execute(sql, params) {
            executeCalls.push({ sql, params });
            if (sql.startsWith('SELECT id, source_id, internal_name FROM items')) {
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
  assert.ok(executeCalls.some((call) => call.sql.startsWith('INSERT INTO audio_asset_links')));
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
    mysqlModule: {
      async createConnection() {
        return {
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          async execute(sql) {
            executeCalls.push(sql);
            if (sql.startsWith('SELECT id, source_id, internal_name FROM items')) {
              const error = new Error("Unknown column 'source_id' in 'field list'");
              error.code = 'ER_BAD_FIELD_ERROR';
              throw error;
            }
            if (sql.startsWith('SELECT id, internal_name FROM items')) {
              return [[{ id: 1001, internal_name: 'Item_1' }]];
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
  assert.ok(executeCalls.some((sql) => sql.startsWith('SELECT id, internal_name FROM items')));
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

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
