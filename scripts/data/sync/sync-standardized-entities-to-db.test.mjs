import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { __test__ } from './sync-standardized-entities-to-db.mjs';

test('resolveNpcLocalizedFields falls back to generated zh map when standardized npc lacks nameZh', () => {
  const record = {
    id: 2,
    internalName: 'DemonEye',
    name: 'Demon Eye',
    localized: {
      en: { namesub: null },
      zh: { namesub: null }
    }
  };
  const existing = {
    category_id: 21,
    name: 'Demon Eye',
    sub_name: ''
  };
  const npcZhMap = new Map([
    ['DemonEye', { nameZh: '恶魔眼', subNameZh: null }]
  ]);

  assert.deepEqual(
    __test__.resolveNpcLocalizedFields(record, existing, npcZhMap),
    {
      nextName: 'Demon Eye',
      nextNameZh: '恶魔眼',
      nextSubName: '',
      nextSubNameZh: null
    }
  );
});

test('buildGeneratedNpcRecord keeps zh supplement fields for public npc fallback', () => {
  const record = {
    id: 3,
    internalName: 'Zombie',
    name: 'Zombie',
    combat: { damage: 14 },
    dimensions: { width: 18 },
    economy: { value: 45 },
    buffImmune: null
  };

  assert.deepEqual(
    __test__.buildGeneratedNpcRecord(record, 'http://localhost:9000/zombie.png', {
      nextNameZh: '僵尸',
      nextSubNameZh: null
    }),
    {
      gameId: 3,
      internalName: 'Zombie',
      imageUrl: 'http://localhost:9000/zombie.png',
      nameZh: '僵尸',
      subNameZh: null,
      rawJson: JSON.stringify({ ...record, imageUrl: 'http://localhost:9000/zombie.png' }),
      combat: { damage: 14 },
      dimensions: { width: 18 },
      economy: { value: 45 },
      buffImmune: null
    }
  );
});

test('buildMysqlModuleRequire tries app package resolver before root resolver fallback', () => {
  const calls = [];
  const repoRoot = '/repo';
  const createRequireImpl = (fromPath) => {
    calls.push(['createRequire', fromPath]);
    if (fromPath.endsWith('/data-query-app/package.json')) {
      return (moduleName) => {
        calls.push(['appRequire', moduleName]);
        return { from: 'data-query-app' };
      };
    }
    throw new Error(`unexpected resolver: ${fromPath}`);
  };
  const rootRequireImpl = (moduleName) => {
    calls.push(['rootRequire', moduleName]);
    return { from: 'root' };
  };

  const mysql = __test__.loadMysqlModule({
    repoRoot,
    createRequireImpl,
    rootRequireImpl,
  });

  assert.deepEqual(mysql, { from: 'data-query-app' });
  assert.deepEqual(calls, [
    ['createRequire', '/repo/data-query-app/package.json'],
    ['appRequire', 'mysql2/promise'],
  ]);
});

test('assertPrimaryDb blocks non-local sync apply writes unless explicitly allowed', () => {
  assert.doesNotThrow(() => __test__.assertPrimaryDb('terria_v1_maint', false, false));
  assert.throws(
    () => __test__.assertPrimaryDb('terria_v1_maint', true, false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => __test__.assertPrimaryDb('terria_v1_maint', true, true));
});

test('syncNpcs skips unchanged existing npc rows on apply', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-sync-npcs-'));
  const standardizedDir = path.join(tempDir, 'data', 'standardized');
  fs.mkdirSync(standardizedDir, { recursive: true });
  const record = npcRecord();
  fs.writeFileSync(path.join(standardizedDir, 'npcs.standardized.json'), JSON.stringify({ records: [record] }), 'utf8');
  const existing = {
    id: 10,
    game_id: 2,
    name: 'Demon Eye',
    name_zh: '恶魔眼',
    sub_name: '',
    sub_name_zh: null,
    internal_name: 'DemonEye',
    category_id: 21,
    banner_source_item_id: null,
    catch_source_item_id: null,
  };
  const connection = createFakeConnection({ existingNpc: existing });
  const stats = makeSyncStats();

  await __test__.syncNpcs(stats, {
    apply: true,
    connection,
    uploadImageUrl: async () => null,
    paths: __test__.buildSyncPaths(tempDir),
    npcZhMap: new Map([['DemonEye', { nameZh: '恶魔眼', subNameZh: null }]]),
  });

  assert.equal(stats.updated, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(connection.calls.some((call) => /\bUPDATE npcs\b/i.test(call.sql)), false);
});

test('syncProjectiles skips unchanged existing projectile rows on apply', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-sync-projectiles-'));
  const standardizedDir = path.join(tempDir, 'data', 'standardized');
  fs.mkdirSync(standardizedDir, { recursive: true });
  const record = projectileRecord();
  fs.writeFileSync(path.join(standardizedDir, 'projectiles.standardized.json'), JSON.stringify({ records: [record] }), 'utf8');
  const existing = {
    id: 20,
    source_id: 9,
    internal_name: 'WoodenArrowFriendly',
    name: 'Wooden Arrow Friendly',
    name_zh: '木箭',
    image_url: 'https://example.invalid/projectile.png',
    ai_style: 1,
    damage: 5,
    knock_back: 2.5,
    penetrate: 1,
    time_left: 600,
    width: 10,
    height: 10,
    scale: 1,
    friendly: 1,
    hostile: 0,
    tile_collide: 1,
    raw_json: JSON.stringify(record),
    status: 1,
    deleted: 0,
  };
  const connection = createFakeConnection({ existingProjectile: existing });
  const stats = makeSyncStats();

  await __test__.syncProjectiles(stats, {
    apply: true,
    connection,
    uploadImageUrl: async () => null,
    paths: __test__.buildSyncPaths(tempDir),
  });

  assert.equal(stats.updated, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(connection.calls.some((call) => /\bUPDATE projectiles\b/i.test(call.sql)), false);
});

test('syncProjectiles updates changed existing projectile rows on apply', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-sync-projectiles-changed-'));
  const standardizedDir = path.join(tempDir, 'data', 'standardized');
  fs.mkdirSync(standardizedDir, { recursive: true });
  const record = projectileRecord();
  fs.writeFileSync(path.join(standardizedDir, 'projectiles.standardized.json'), JSON.stringify({ records: [record] }), 'utf8');
  const connection = createFakeConnection({
    existingProjectile: {
      id: 20,
      source_id: 9,
      internal_name: 'WoodenArrowFriendly',
      name: 'Stale name',
      name_zh: '木箭',
      image_url: 'https://example.invalid/projectile.png',
      ai_style: 1,
      damage: 5,
      knock_back: 2.5,
      penetrate: 1,
      time_left: 600,
      width: 10,
      height: 10,
      scale: 1,
      friendly: 1,
      hostile: 0,
      tile_collide: 1,
      raw_json: JSON.stringify(record),
      status: 1,
      deleted: 0,
    },
  });
  const stats = makeSyncStats();

  await __test__.syncProjectiles(stats, {
    apply: true,
    connection,
    uploadImageUrl: async () => null,
    paths: __test__.buildSyncPaths(tempDir),
  });

  assert.equal(stats.updated, 1);
  assert.equal(stats.skipped, 0);
  assert.equal(connection.calls.some((call) => /\bUPDATE projectiles\b/i.test(call.sql)), true);
});

function npcRecord() {
  return {
    id: 2,
    internalName: 'DemonEye',
    name: 'Demon Eye',
    localized: {
      zh: { namesub: null }
    },
    flags: { friendly: false },
  };
}

function projectileRecord() {
  return {
    id: 9,
    internalName: 'WoodenArrowFriendly',
    name: 'Wooden Arrow Friendly',
    localized: { zh: { name: '木箭' } },
    imageUrl: 'https://example.invalid/projectile.png',
    aiStyle: 1,
    combat: { damage: 5, knockBack: 2.5, penetrate: 1 },
    lifecycle: { timeLeft: 600 },
    dimensions: { width: 10, height: 10, scale: 1 },
    flags: { friendly: true, hostile: false, tileCollide: true },
  };
}

function makeSyncStats() {
  return { checked: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, samples: [] };
}

function createFakeConnection({ existingNpc = null, existingProjectile = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ method: 'query', sql, params });
      if (/FROM\s+npcs\b/i.test(sql)) return [[existingNpc].filter(Boolean)];
      if (/FROM\s+projectiles\b/i.test(sql)) return [[existingProjectile].filter(Boolean)];
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ method: 'execute', sql, params });
      return [{ affectedRows: 1, insertId: 999 }];
    },
  };
}
