import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { runImageSync } from './run-image-sync.mjs';

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

test('item dry run recognizes a relative managed URL as already managed', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-image-sync-relative-managed-'));
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
    path.join(tempDir, 'data', 'standardized', 'items.standardized.json'),
    JSON.stringify({
      records: [
        { internalName: 'IronPickaxe', imageUrl: '/terrapedia-images/items/iron-pickaxe.png' },
      ],
    }),
    'utf8'
  );

  const result = spawnSync(process.execPath, [scriptPath, '--apply=false', '--scopes=items'], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.modules.items.candidates, 1);
  assert.equal(payload.modules.items.alreadyManaged, 1);
  assert.equal(payload.modules.items.changed, 0);
  assert.equal(payload.modules.items.uploaded, 0);
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

test('armor_item_images scope dry-run counts report candidates without mutating evidence report', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-image-sync-armor-items-'));
  const reportsDir = path.join(tempDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
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
  const filePath = path.join(reportsDir, 'armor-item-image-evidence-test.json');
  const originalPayload = {
    candidates: [
      {
        internalName: 'CopperHelmet',
        name: 'Copper Helmet',
        imageFileTitle: 'Copper Helmet.png',
        sourceUrl: 'https://terraria.wiki.gg/images/Copper_Helmet.png',
      },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(originalPayload, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--apply=false',
    '--scopes=armor_item_images',
    `--input=${filePath}`,
  ], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.modules.armor_item_images.total, 1);
  assert.equal(payload.modules.armor_item_images.candidates, 1);
  assert.equal(payload.modules.armor_item_images.changed, 1);
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

test('runImageSync items dry run reports ordered key sets and the completion equation', async () => {
  const workspace = createImageSyncWorkspace();

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: false,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/']
  }, workspace.dependencies());

  assert.equal(result.total, 4);
  assert.equal(result.missingSource, 1);
  assert.deepEqual(result.missingSourceKeys, ['NoSource']);
  assert.deepEqual(result.candidateKeys, ['CopperCoin', 'Torch', 'Wood']);
  assert.deepEqual(result.alreadyManagedKeys, ['Torch']);
  assert.deepEqual(result.uploadKeys, ['CopperCoin', 'Wood']);
  assert.equal(result.candidates, result.uploadKeys.length + result.alreadyManagedKeys.length);
  assert.equal(result.uploaded, 0);
  assert.equal(result.status, 'completed');
});

test('runImageSync apply completes the equation and records managed evidence', async () => {
  const workspace = createImageSyncWorkspace();

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/']
  }, workspace.dependencies());

  assert.equal(result.status, 'completed');
  assert.equal(result.uploaded, 2);
  assert.equal(result.candidates, result.uploaded + result.alreadyManaged);
  assert.deepEqual(
    result.completedKeys,
    [...result.uploadedKeys, ...result.alreadyManagedKeys].sort()
  );
  const evidence = result.managedImages.find((entry) => entry.key === 'CopperCoin');
  assert.equal(evidence.originalUrl, 'https://terraria.wiki.gg/images/Copper_Coin.png');
  assert.equal(evidence.managedUrl, 'http://localhost:9000/terrapedia-images/items/coppercoin.png');
  assert.match(evidence.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'))
      .records.find((record) => record.internalName === 'CopperCoin').imageUrl,
    'http://localhost:9000/terrapedia-images/items/coppercoin.png'
  );
});

test('runImageSync fails closed when an upload returns null', async () => {
  const workspace = createImageSyncWorkspace();
  const dependencies = workspace.dependencies({ failUploadFor: 'Wood' });

  await assert.rejects(
    () => runImageSync({
      repoRoot: workspace.root,
      scopes: ['items'],
      apply: true,
      outputPath: workspace.reportPath,
      progressPath: workspace.progressPath,
      promotionResultPath: workspace.promotionResultPath,
      managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/']
    }, dependencies),
    /image sync failed/i
  );

  const report = JSON.parse(fs.readFileSync(workspace.reportPath, 'utf8'));
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.failedKeys, ['Wood']);
  assert.equal(workspace.progressEvents.at(-1).status, 'failed');
  assert.ok(!workspace.progressEvents.some((event) => event.status === 'completed'));
});

test('runImageSync accepts standardized bytes an earlier sync already rewrote', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  // An earlier sync moved this item onto managed storage. That is what sync is
  // for, so a later round must still be allowed to run.
  payload.records.find((r) => r.internalName === 'Wood').imageUrl =
    '/terrapedia-images/items/wood.png';
  fs.writeFileSync(workspace.itemsPath, `${JSON.stringify(payload, null, 2)}\n`);

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    managedObjectOrigin: 'http://127.0.0.1:19100',
    managedUrlPrefixes: ['http://127.0.0.1:19100/terrapedia-images/items/']
  }, workspace.dependencies());

  assert.equal(result.status, 'completed');
  assert.ok(result.alreadyManagedKeys.includes('Wood'));
});

test('runImageSync refuses standardized bytes whose promoted fields drifted', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  // A promoted file title must stay exactly what promotion wrote.
  payload.records.find((r) => r.internalName === 'CopperCoin').imageFileTitle = 'Something Else.png';
  fs.writeFileSync(workspace.itemsPath, `${JSON.stringify(payload, null, 2)}\n`);

  await assert.rejects(
    () => runImageSync({
      repoRoot: workspace.root,
      scopes: ['items'],
      apply: true,
      outputPath: workspace.reportPath,
      progressPath: workspace.progressPath,
      promotionResultPath: workspace.promotionResultPath,
      managedUrlPrefixes: ['http://127.0.0.1:19100/terrapedia-images/items/']
    }, workspace.dependencies()),
    /promoted field imageFileTitle drifted for CopperCoin/i
  );
});

test('runImageSync apply refuses standardized records the promotion result did not produce', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  // A promoted identity that is simply gone means these are not the bytes the
  // promotion produced, however plausible the rest looks.
  payload.records = payload.records.filter((r) => r.internalName !== 'CopperCoin');
  fs.writeFileSync(workspace.itemsPath, `${JSON.stringify(payload, null, 2)}\n`);

  await assert.rejects(
    () => runImageSync({
      repoRoot: workspace.root,
      scopes: ['items'],
      apply: true,
      outputPath: workspace.reportPath,
      progressPath: workspace.progressPath,
      promotionResultPath: workspace.promotionResultPath,
      managedUrlPrefixes: ['http://127.0.0.1:19100/terrapedia-images/items/']
    }, workspace.dependencies()),
    /promoted identity CopperCoin is missing/i
  );

  assert.equal(workspace.uploadedUrls.length, 0);
});

test('runImageSync apply requires an authorized context when one is demanded', async () => {
  const workspace = createImageSyncWorkspace();

  await assert.rejects(
    () => runImageSync({
      repoRoot: workspace.root,
      scopes: ['items'],
      apply: true,
      requireAuthorization: true,
      outputPath: workspace.reportPath,
      progressPath: workspace.progressPath,
      promotionResultPath: workspace.promotionResultPath,
      managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/']
    }, workspace.dependencies({
      loadAuthorizedContext: () => {
        throw new Error('TERRAPEDIA_AUTHORIZED_PACKET_PATH is required');
      }
    })),
    /TERRAPEDIA_AUTHORIZED_PACKET_PATH is required/
  );

  assert.equal(workspace.uploadedUrls.length, 0);
});

function createImageSyncWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-image-sync-runner-'));
  const itemsPath = path.join(root, 'data/standardized/items.standardized.json');
  const reportPath = path.join(root, 'reports/image-sync.json');
  const progressPath = path.join(root, 'reports/progress.json');
  const promotionResultPath = path.join(root, 'reports/promotion.result.json');
  fs.mkdirSync(path.dirname(itemsPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const itemsPayload = {
    schemaVersion: '1.0.0',
    records: [
      {
        id: 8,
        internalName: 'Torch',
        name: 'Torch',
        imageFileTitle: 'Torch.png',
        imageUrl: 'http://localhost:9000/terrapedia-images/items/torch.png'
      },
      {
        id: 9,
        internalName: 'Wood',
        name: 'Wood',
        imageFileTitle: 'Wood.png',
        imageUrl: 'https://terraria.wiki.gg/images/Wood.png'
      },
      {
        id: 71,
        internalName: 'CopperCoin',
        name: 'Copper Coin',
        imageFileTitle: 'Copper Coin.png',
        imageUrl: 'https://terraria.wiki.gg/images/Copper_Coin.png'
      },
      { id: 99, internalName: 'NoSource', name: 'No Source', imageFileTitle: null, imageUrl: null }
    ]
  };
  const serialized = `${JSON.stringify(itemsPayload, null, 2)}\n`;
  fs.writeFileSync(itemsPath, serialized);
  fs.writeFileSync(promotionResultPath, `${JSON.stringify({
    resultKind: 'canonical_item_image_source_promotion_result',
    status: 'COMPLETED',
    after: { sha256: sha256Hex(serialized) },
    changes: [
      {
        itemInternalName: 'CopperCoin',
        fields: {
          imageFileTitle: { before: null, after: 'Copper Coin.png' },
          imageUrl: { before: null, after: 'https://terraria.wiki.gg/images/Copper_Coin.png' },
          imageWidth: { before: null, after: null },
          imageHeight: { before: null, after: null },
          imageContentType: { before: null, after: null }
        }
      },
      {
        itemInternalName: 'Wood',
        fields: {
          imageFileTitle: { before: null, after: 'Wood.png' },
          imageUrl: { before: null, after: 'https://terraria.wiki.gg/images/Wood.png' },
          imageWidth: { before: null, after: null },
          imageHeight: { before: null, after: null },
          imageContentType: { before: null, after: null }
        }
      }
    ]
  }, null, 2)}\n`);

  const progressEvents = [];
  const uploadedUrls = [];
  return {
    root,
    itemsPath,
    reportPath,
    progressPath,
    promotionResultPath,
    progressEvents,
    uploadedUrls,
    dependencies({ failUploadFor = null, loadAuthorizedContext = null, probeObject = null } = {}) {
      return {
        writeProgress: (_filePath, payload) => progressEvents.push(payload),
        ...(loadAuthorizedContext ? { loadAuthorizedContext } : {}),
        ...(probeObject ? { probeObject } : {}),
        createUploader: async () => ({
          uploadImageUrl: async (sourceUrl, context) => {
            if (failUploadFor && context?.nameHint === failUploadFor) return null;
            uploadedUrls.push(sourceUrl);
            return `http://localhost:9000/terrapedia-images/items/${context.nameHint.toLowerCase()}.png`;
          }
        }),
        resolveWikiImageUrl: async () => null,
        now: (() => {
          let tick = 0;
          return () => new Date(Date.parse('2026-08-01T00:00:00.000Z') + (tick += 1) * 1000).toISOString();
        })()
      };
    }
  };
}

function sha256Hex(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

test('runImageSync treats historical MinIO endpoints as already managed', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  // An object uploaded by an earlier sync still carries the historical port.
  payload.records.find((record) => record.internalName === 'Wood').imageUrl =
    'http://localhost:9000/terrapedia-images/items/2026/04/08/abc.png';
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(workspace.itemsPath, serialized);
  fs.writeFileSync(workspace.promotionResultPath, `${JSON.stringify({
    resultKind: 'canonical_item_image_source_promotion_result',
    status: 'COMPLETED',
    after: { sha256: sha256Hex(serialized) }
  }, null, 2)}\n`);

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    managedUrlPrefixes: ['http://localhost:19100/terrapedia-images/']
  }, workspace.dependencies());

  assert.deepEqual(result.alreadyManagedKeys, ['Torch', 'Wood']);
  assert.deepEqual(result.uploadKeys, ['CopperCoin']);
  assert.deepEqual(workspace.uploadedUrls, ['https://terraria.wiki.gg/images/Copper_Coin.png']);
});

test('legacy-origin repair probes exactly its candidates and atomically stores relative paths', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  payload.records.find((record) => record.internalName === 'Torch').imageUrl =
    'http://localhost:9000/terrapedia-images/items/torch.png';
  payload.records.find((record) => record.internalName === 'Wood').imageUrl =
    'http://localhost:9000/terrapedia-images/items/wood.png';
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(workspace.itemsPath, serialized);
  fs.writeFileSync(workspace.promotionResultPath, `${JSON.stringify({
    resultKind: 'canonical_item_image_source_promotion_result',
    status: 'COMPLETED',
    after: { sha256: sha256Hex(serialized) }
  }, null, 2)}\n`);
  const probed = [];

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    legacyOriginRepair: true,
    legacyOrigin: 'http://localhost:9000',
    expectedLegacyCount: 2,
    managedObjectOrigin: 'http://127.0.0.1:19100',
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
  }, workspace.dependencies({
    probeObject: async (url) => {
      probed.push(url);
      return true;
    },
    createUploader: async () => {
      throw new Error('legacy-origin repair must not create an uploader');
    }
  }));

  assert.equal(result.status, 'completed');
  assert.equal(result.normalizedKeys.length, 2);
  assert.equal(result.uploaded, 0);
  assert.deepEqual(probed, [
    'http://127.0.0.1:19100/terrapedia-images/items/torch.png',
    'http://127.0.0.1:19100/terrapedia-images/items/wood.png'
  ]);
  const written = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  assert.equal(written.records.find((record) => record.internalName === 'Torch').imageUrl,
    '/terrapedia-images/items/torch.png');
  assert.equal(written.records.find((record) => record.internalName === 'Wood').imageUrl,
    '/terrapedia-images/items/wood.png');
  assert.equal(written.records.find((record) => record.internalName === 'CopperCoin').imageUrl,
    'https://terraria.wiki.gg/images/Copper_Coin.png');
});

test('legacy-origin repair leaves standardized bytes unchanged when any probe fails', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  payload.records.find((record) => record.internalName === 'Torch').imageUrl =
    'http://localhost:9000/terrapedia-images/items/torch.png';
  payload.records.find((record) => record.internalName === 'Wood').imageUrl =
    'http://localhost:9000/terrapedia-images/items/wood.png';
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(workspace.itemsPath, serialized);
  fs.writeFileSync(workspace.promotionResultPath, `${JSON.stringify({
    resultKind: 'canonical_item_image_source_promotion_result',
    status: 'COMPLETED',
    after: { sha256: sha256Hex(serialized) }
  }, null, 2)}\n`);
  const beforeBytes = fs.readFileSync(workspace.itemsPath);
  let probes = 0;

  await assert.rejects(
    () => runImageSync({
      repoRoot: workspace.root,
      scopes: ['items'],
      apply: true,
      legacyOriginRepair: true,
      legacyOrigin: 'http://localhost:9000',
      expectedLegacyCount: 2,
      managedObjectOrigin: 'http://127.0.0.1:19100',
      outputPath: workspace.reportPath,
      progressPath: workspace.progressPath,
      promotionResultPath: workspace.promotionResultPath,
    }, workspace.dependencies({
      probeObject: async () => {
        probes += 1;
        return probes !== 2;
      },
      createUploader: async () => {
        throw new Error('legacy-origin repair must not create an uploader');
      }
    })),
    /image sync failed/i
  );

  assert.equal(probes, 2);
  assert.deepEqual(fs.readFileSync(workspace.itemsPath), beforeBytes);
  const report = JSON.parse(fs.readFileSync(workspace.reportPath, 'utf8'));
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.failedKeys, ['Wood']);
  assert.ok(!workspace.progressEvents.some((event) => event.status === 'completed'));
});

test('legacy-origin repair rejects candidate-count drift before probing', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  payload.records.find((record) => record.internalName === 'Torch').imageUrl =
    'http://localhost:9000/terrapedia-images/items/torch.png';
  payload.records.find((record) => record.internalName === 'Wood').imageUrl =
    'http://localhost:9000/terrapedia-images/items/wood.png';
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(workspace.itemsPath, serialized);
  fs.writeFileSync(workspace.promotionResultPath, `${JSON.stringify({
    resultKind: 'canonical_item_image_source_promotion_result',
    status: 'COMPLETED',
    after: { sha256: sha256Hex(serialized) }
  }, null, 2)}\n`);

  await assert.rejects(
    () => runImageSync({
      repoRoot: workspace.root,
      scopes: ['items'],
      apply: true,
      legacyOriginRepair: true,
      legacyOrigin: 'http://localhost:9000',
      expectedLegacyCount: 3,
      managedObjectOrigin: 'http://127.0.0.1:19100',
      outputPath: workspace.reportPath,
      progressPath: workspace.progressPath,
      promotionResultPath: workspace.promotionResultPath,
    }, workspace.dependencies({
      probeObject: async () => {
        throw new Error('candidate-count drift must fail before probing');
      }
    })),
    /expected legacy-origin candidate count 3, found 2/i
  );
});

test('runImageSync reuses a local managed object instead of re-downloading it', async () => {
  const workspace = createImageSyncWorkspace();
  const probed = [];

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    localEvidence: {
      // The earlier crawl already stored this exact file under managed storage.
      CopperCoin: {
        sourceFileTitle: 'Copper_Coin.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/37/coin.png'
      },
      // The earlier crawl stored a different file than verification selected.
      Wood: {
        sourceFileTitle: 'Wood_(placed).png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/21/wood-placed.png'
      }
    },
    managedObjectOrigin: 'http://127.0.0.1:19100',
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/', 'http://127.0.0.1:19100/terrapedia-images/']
  }, workspace.dependencies({
    probeObject: async (url) => {
      probed.push(url);
      return true;
    }
  }));

  assert.deepEqual(result.reusedKeys, ['CopperCoin']);
  assert.deepEqual(result.uploadedKeys, ['Wood']);
  assert.deepEqual(probed, ['http://127.0.0.1:19100/terrapedia-images/items/wiki/item-images/37/coin.png']);
  assert.deepEqual(
    result.completedKeys,
    [...result.uploadedKeys, ...result.reusedKeys, ...result.alreadyManagedKeys].sort()
  );
  assert.equal(
    JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'))
      .records.find((record) => record.internalName === 'CopperCoin').imageUrl,
    '/terrapedia-images/items/wiki/item-images/37/coin.png'
  );
  const evidence = result.managedImages.find((entry) => entry.key === 'CopperCoin');
  assert.equal(evidence.originalUrl, 'https://terraria.wiki.gg/images/Copper_Coin.png');
  assert.equal(evidence.reused, true);
});

test('runImageSync uploads when a local object cannot be reached', async () => {
  const workspace = createImageSyncWorkspace();

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    localEvidence: {
      CopperCoin: {
        sourceFileTitle: 'Copper_Coin.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/37/coin.png'
      }
    },
    managedObjectOrigin: 'http://127.0.0.1:19100',
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/', 'http://127.0.0.1:19100/terrapedia-images/']
  }, workspace.dependencies({ probeObject: async () => false }));

  assert.deepEqual(result.reusedKeys, []);
  assert.deepEqual(result.reuseProbeFailedKeys, ['CopperCoin']);
  assert.ok(result.uploadedKeys.includes('CopperCoin'));
});

test('runImageSync stores a reused object as a relative managed path', async () => {
  const workspace = createImageSyncWorkspace();

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    localEvidence: {
      CopperCoin: {
        sourceFileTitle: 'Copper_Coin.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/37/coin.png'
      }
    },
    managedObjectOrigin: 'http://127.0.0.1:19100',
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/', 'http://127.0.0.1:19100/terrapedia-images/']
  }, workspace.dependencies({ probeObject: async () => true }));

  assert.deepEqual(result.reusedKeys, ['CopperCoin']);
  // The origin belongs to the probe, never to the stored value: an absolute
  // host:port in standardized data is what left 331 rows pointing at a dead
  // endpoint, and the backend itself returns relative paths.
  assert.equal(
    JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'))
      .records.find((record) => record.internalName === 'CopperCoin').imageUrl,
    '/terrapedia-images/items/wiki/item-images/37/coin.png'
  );
  const evidence = result.managedImages.find((entry) => entry.key === 'CopperCoin');
  assert.equal(evidence.managedUrl, '/terrapedia-images/items/wiki/item-images/37/coin.png');
  assert.equal(evidence.probedUrl, 'http://127.0.0.1:19100/terrapedia-images/items/wiki/item-images/37/coin.png');
});

test('runImageSync normalizes an absolute URL that already points at the configured origin', async () => {
  const workspace = createImageSyncWorkspace();
  const payload = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  payload.records.find((r) => r.internalName === 'Torch').imageUrl =
    'http://127.0.0.1:19100/terrapedia-images/items/torch.png';
  // A historical origin is a separate, unverified concern and must be left alone.
  payload.records.find((r) => r.internalName === 'Wood').imageUrl =
    'http://localhost:9000/terrapedia-images/items/wood.png';
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(workspace.itemsPath, serialized);
  fs.writeFileSync(workspace.promotionResultPath, `${JSON.stringify({
    resultKind: 'canonical_item_image_source_promotion_result',
    status: 'COMPLETED',
    after: { sha256: sha256Hex(serialized) }
  }, null, 2)}\n`);

  const result = await runImageSync({
    repoRoot: workspace.root,
    scopes: ['items'],
    apply: true,
    outputPath: workspace.reportPath,
    progressPath: workspace.progressPath,
    promotionResultPath: workspace.promotionResultPath,
    managedObjectOrigin: 'http://127.0.0.1:19100',
    // Real config prefixes carry the entity segment, and the entity resolver
    // keeps only prefixes that do.
    managedUrlPrefixes: [
      'http://127.0.0.1:19100/terrapedia-images/items/',
      'http://localhost:9000/terrapedia-images/items/'
    ]
  }, workspace.dependencies());

  const written = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  assert.equal(
    written.records.find((r) => r.internalName === 'Torch').imageUrl,
    '/terrapedia-images/items/torch.png'
  );
  assert.equal(
    written.records.find((r) => r.internalName === 'Wood').imageUrl,
    'http://localhost:9000/terrapedia-images/items/wood.png'
  );
  assert.deepEqual(result.normalizedKeys, ['Torch']);
  assert.ok(result.alreadyManagedKeys.includes('Torch'));
});
