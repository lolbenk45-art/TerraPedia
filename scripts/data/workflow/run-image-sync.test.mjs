import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'data', 'workflow', 'run-image-sync.mjs');

test('npc and projectile items-prefix URLs are not treated as already managed', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-image-sync-'));
  fs.mkdirSync(path.join(tempDir, 'data', 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'scripts', 'dev', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, 'scripts', 'dev', 'config', 'local-stack.config.json'),
    JSON.stringify({
      minio: {
        publicEndpoint: 'http://localhost:9000',
        endpoint: 'http://localhost:9000',
        bucket: 'terrapedia-images',
        objectPrefix: 'items',
      },
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(tempDir, 'data', 'standardized', 'npcs.standardized.json'),
    JSON.stringify({
      records: [
        { internalName: 'Guide', imageUrl: 'http://localhost:9000/terrapedia-images/items/guide.png' },
      ],
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(tempDir, 'data', 'standardized', 'projectiles.standardized.json'),
    JSON.stringify({
      records: [
        { internalName: 'WoodenArrowFriendly', imageUrl: 'http://localhost:9000/terrapedia-images/items/wooden-arrow.png' },
      ],
    }),
    'utf8'
  );

  const result = spawnSync(process.execPath, [scriptPath, '--apply=false', '--scopes=npcs,projectiles'], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.modules.npcs.alreadyManaged, 0);
  assert.equal(payload.modules.npcs.changed, 1);
  assert.equal(payload.modules.projectiles.alreadyManaged, 0);
  assert.equal(payload.modules.projectiles.changed, 1);
});

test('armor_set_images scope dry-run counts unmanaged raw armor set images without mutating file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-image-sync-armor-'));
  const sharedDataRoot = path.join(tempDir, 'shared-data');
  const rawDir = path.join(sharedDataRoot, 'raw', 'wiki');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'scripts', 'dev', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, 'scripts', 'dev', 'config', 'local-stack.config.json'),
    JSON.stringify({
      minio: {
        publicEndpoint: 'http://localhost:9000',
        endpoint: 'http://localhost:9000',
        bucket: 'terrapedia-images',
        objectPrefix: 'items',
      },
    }),
    'utf8'
  );
  const filePath = path.join(rawDir, 'armor_set_images.parsed.latest.json');
  const originalPayload = {
    armorSetImages: [
      {
        pageTitle: 'Wood armor',
        imageRole: 'male',
        sourceFileTitle: 'Wood armor.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: null,
      },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(originalPayload, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath, '--apply=false', '--scopes=armor_set_images'], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.modules.armor_set_images.total, 1);
  assert.equal(payload.modules.armor_set_images.candidates, 1);
  assert.equal(payload.modules.armor_set_images.changed, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), originalPayload);
});
