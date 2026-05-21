import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
  isManagedImageUrl,
  normalizeManagedImageUrlPrefixes,
  resolveManagedImageUrlPrefixes
} from './managed-image-url-policy.mjs';

test('resolveManagedImageUrlPrefixes is fail-closed without config', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-empty-'));
  const prefixes = resolveManagedImageUrlPrefixes({ repoRoot, env: {} });

  assert.deepEqual(prefixes, []);
  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/items/wood.png', prefixes), false);
  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/npcs/guide.png', prefixes), false);
  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/projectiles/wooden-arrow.png', prefixes), false);
});

test('resolveManagedImageUrlPrefixes keeps explicit prefixes and adds configured MinIO endpoints', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-prefixes-'));
  const prefixes = resolveManagedImageUrlPrefixes({
    repoRoot,
    env: {
      TERRAPEDIA_MANAGED_IMAGE_URL_PREFIXES: 'https://cdn.example.test/minio/custom-bucket/custom/items/',
      TERRAPEDIA_MINIO_PUBLIC_ENDPOINT: 'https://cdn.example.test/minio/',
      TERRAPEDIA_MINIO_ENDPOINT: 'minio.internal:9000',
      TERRAPEDIA_MINIO_BUCKET: 'custom-bucket',
      TERRAPEDIA_MINIO_OBJECT_PREFIX: '/custom/items/'
    }
  });

  assert.ok(prefixes.includes('https://cdn.example.test/minio/custom-bucket/custom/items/'));
  assert.ok(prefixes.includes('http://minio.internal:9000/custom-bucket/custom/items/'));
  assert.equal(
    isManagedImageUrl('https://cdn.example.test/minio/custom-bucket/custom/items/wood.png', prefixes),
    true
  );
  assert.equal(isManagedImageUrl('https://cdn.example.test/minio/custom-bucket/custom/items/wood.png', []), false);
  assert.equal(
    isManagedImageUrl('https://evil.example.test/terrapedia-images/items/wood.png', prefixes),
    false
  );
});

test('isManagedImageUrl matches configured HTTP URL origin and path only', () => {
  const [prefix] = DEFAULT_MANAGED_IMAGE_URL_PREFIXES;

  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/items/wood.png', [prefix]), true);
  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/items_evil/wood.png', [prefix]), false);
  assert.equal(isManagedImageUrl('http://evil.example/terrapedia-images/items/wood.png', [prefix]), false);
  assert.equal(isManagedImageUrl('//localhost:9000/terrapedia-images/items/wood.png', [prefix]), false);
  assert.equal(isManagedImageUrl('http://user@localhost:9000/terrapedia-images/items/wood.png', [prefix]), false);
  assert.equal(isManagedImageUrl('HTTP://localhost:9000/terrapedia-images/items/wood.png', [prefix]), true);
  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/ITEMS/wood.png', [prefix]), false);
});

test('normalizeManagedImageUrlPrefixes keeps explicit empty allowlist empty', () => {
  assert.deepEqual(normalizeManagedImageUrlPrefixes([]), []);
  assert.deepEqual(normalizeManagedImageUrlPrefixes(null), []);
  assert.equal(isManagedImageUrl('http://localhost:9000/terrapedia-images/items/wood.png', []), false);
});

test('resolveManagedImageUrlPrefixes rejects unsafe MinIO endpoints', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-unsafe-'));
  const prefixes = resolveManagedImageUrlPrefixes({
    repoRoot,
    env: {
      TERRAPEDIA_MINIO_PUBLIC_ENDPOINT: 'https://user:pass@assets.example.test',
      TERRAPEDIA_MINIO_ENDPOINT: 'https://trusted.example@evil.example/path',
      TERRAPEDIA_MANAGED_IMAGE_URL_PREFIXES: [
        'https://host.example/terrapedia-images/items/?x=1',
        '//cdn.example.test/terrapedia-images/items/'
      ].join(',')
    }
  });

  assert.deepEqual(prefixes, []);
});

test('resolveManagedImageUrlPrefixes derives S3 endpoint from local stack MinIO credentials', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-credentials-'));
  const configDir = path.join(repoRoot, 'scripts', 'dev', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'local-stack.config.json'),
    JSON.stringify({
      minio: {
        credentialsFile: 'scripts/dev/config/credentials.json'
      }
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(configDir, 'credentials.json'),
    JSON.stringify({
      url: 'http://minio.example.test:9001'
    }),
    'utf8'
  );

  const prefixes = resolveManagedImageUrlPrefixes({ repoRoot, env: {} });

  assert.ok(prefixes.includes('http://minio.example.test:9000/terrapedia-images/items/'));
  assert.equal(
    isManagedImageUrl('http://minio.example.test:9000/terrapedia-images/items/wiki/armor.png', prefixes),
    true
  );
});

test('resolveManagedImageUrlPrefixes reads MinIO public endpoint from local stack config', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-config-'));
  const configDir = path.join(repoRoot, 'scripts', 'dev', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'local-stack.config.json'),
    JSON.stringify({
      minio: {
        publicEndpoint: 'https://assets.example.test',
        endpoint: 'http://minio.internal:9000',
        bucket: 'configured-bucket',
        objectPrefix: 'configured/items'
      }
    }),
    'utf8'
  );

  const prefixes = resolveManagedImageUrlPrefixes({ repoRoot, env: {} });

  assert.ok(prefixes.includes('https://assets.example.test/configured-bucket/configured/items/'));
  assert.ok(prefixes.includes('http://minio.internal:9000/configured-bucket/configured/items/'));
  assert.equal(
    isManagedImageUrl('https://assets.example.test/configured-bucket/configured/items/item.png', prefixes),
    true
  );
});

test('resolveManagedImageUrlPrefixes reads primary worktree config from linked worktrees', () => {
  const primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-primary-'));
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-image-linked-'));
  const configDir = path.join(primaryRoot, 'scripts', 'dev', 'config');
  const gitWorktreeDir = path.join(primaryRoot, '.git', 'worktrees', 'linked');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(gitWorktreeDir, { recursive: true });
  fs.writeFileSync(
    path.join(worktreeRoot, '.git'),
    `gitdir: ${gitWorktreeDir}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(configDir, 'local-stack.config.json'),
    JSON.stringify({
      minio: {
        publicEndpoint: 'http://localhost:9000',
        bucket: 'terrapedia-images',
        objectPrefix: 'items'
      }
    }),
    'utf8'
  );

  const prefixes = resolveManagedImageUrlPrefixes({ repoRoot: worktreeRoot, env: {} });

  assert.ok(prefixes.includes('http://localhost:9000/terrapedia-images/items/'));
  assert.equal(
    isManagedImageUrl('http://localhost:9000/terrapedia-images/items/wiki/armor-sets/wood.png', prefixes),
    true
  );
});

test('default managed prefix allowlist covers canonical npc and projectile prefixes', () => {
  assert.ok(DEFAULT_MANAGED_IMAGE_URL_PREFIXES.includes('http://localhost:9000/terrapedia-images/items/'));
  assert.ok(DEFAULT_MANAGED_IMAGE_URL_PREFIXES.includes('http://localhost:9000/terrapedia-images/npcs/'));
  assert.ok(DEFAULT_MANAGED_IMAGE_URL_PREFIXES.includes('http://localhost:9000/terrapedia-images/projectiles/'));
  assert.ok(DEFAULT_MANAGED_IMAGE_URL_PREFIXES.includes('http://localhost:9000/terrapedia-images/buffs/'));
  assert.ok(DEFAULT_MANAGED_IMAGE_URL_PREFIXES.includes('http://localhost:9000/terrapedia-images/bosses/'));
  assert.equal(
    isManagedImageUrl('http://localhost:9000/terrapedia-images/npcs/guide.png', DEFAULT_MANAGED_IMAGE_URL_PREFIXES),
    true
  );
  assert.equal(
    isManagedImageUrl('http://localhost:9000/terrapedia-images/projectiles/wooden-arrow.png', DEFAULT_MANAGED_IMAGE_URL_PREFIXES),
    true
  );
  assert.equal(
    isManagedImageUrl('http://localhost:9000/terrapedia-images/buffs/ironskin.png', DEFAULT_MANAGED_IMAGE_URL_PREFIXES),
    true
  );
  assert.equal(
    isManagedImageUrl('http://localhost:9000/terrapedia-images/bosses/king-slime.png', DEFAULT_MANAGED_IMAGE_URL_PREFIXES),
    true
  );
});
