import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

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

test('town_npc_maintenance scope dry-run counts wiki detail images without mutating file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-image-sync-town-npc-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  const filePath = path.join(generatedDir, 'wiki-town-npc-maintenance.latest.json');
  const originalPayload = {
    records: [
      {
        internalName: 'Merchant',
        wikiDetails: {
          spriteImage: 'https://terraria.wiki.gg/images/Merchant.png',
          mapIconImage: 'https://terraria.wiki.gg/images/Map_Icon_Merchant.png',
          dialogPortraitImage: 'https://terraria.wiki.gg/images/thumb/Merchant_%28portrait%29.png/70px-Merchant_%28portrait%29.png',
        },
      },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(originalPayload, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--apply=false',
    '--scopes=town_npc_maintenance',
    `--input=${filePath}`,
  ], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.modules.town_npc_maintenance.total, 3);
  assert.equal(payload.modules.town_npc_maintenance.candidates, 3);
  assert.equal(payload.modules.town_npc_maintenance.changed, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), originalPayload);
});

test('run-image-sync uses shared entity prefix helper and removes local duplicate', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.doesNotMatch(script, /function\s+resolveEntityManagedUrlPrefixes\b/);
  assert.match(script, /resolveEntityManagedUrlPrefixes/);
});

test('town_npc_maintenance apply uploads images with npcs entity domain', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-image-sync-town-npc-apply-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  const upstreamImagePath = '/images/Merchant.png';
  const filePath = path.join(generatedDir, 'wiki-town-npc-maintenance.latest.json');
  const multipartBodies = [];

  const server = http.createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/auth/login') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: { token: 'test-token' } }));
      return;
    }
    if (request.method === 'GET' && request.url === upstreamImagePath) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/files/images') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      multipartBodies.push(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: { url: 'http://localhost:9000/terrapedia-images/npcs/merchant.png' } }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const sourceUrl = `http://127.0.0.1:${port}${upstreamImagePath}`;
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      records: [
        {
          internalName: 'Merchant',
          wikiDetails: {
            spriteImage: sourceUrl,
          },
        },
      ],
    }, null, 2),
    'utf8',
  );

  try {
    const result = await spawnNode([
      scriptPath,
      '--apply=true',
      '--scopes=town_npc_maintenance',
      `--input=${filePath}`,
      `--apiBase=http://127.0.0.1:${port}/api`,
      '--adminUsername=admin',
      '--adminPassword=secret',
    ], { cwd: tempDir });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(multipartBodies.length, 1);
    assert.match(multipartBodies[0], /name="entityDomain"\r?\n\r?\nnpcs/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function spawnNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      ...options,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
