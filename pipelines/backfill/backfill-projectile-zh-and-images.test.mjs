import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProjectileBackfillProgressPayload,
  buildProjectileImageUploadRequest
} from './backfill-projectile-zh-and-images.mjs';

test('buildProjectileBackfillProgressPayload writes crawler progress contract fields', () => {
  const payload = buildProjectileBackfillProgressPayload({
    status: 'running',
    current: 12,
    total: 1111,
    message: 'backfilling projectile zh and image evidence',
    progressPath: 'data/generated/wiki-sync-progress.latest.json',
    reportPath: '/repo/reports/projectile-zh-image-backfill-2026-06-04.json',
    outputPath: '/repo/data/standardized/projectiles.standardized.json',
    startedAt: '2026-06-04T00:00:00.000Z',
    now: '2026-06-04T00:01:00.000Z'
  });

  assert.equal(payload.actionId, 'projectile-zh-image-backfill');
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'backfill');
  assert.equal(payload.current, 12);
  assert.equal(payload.total, 1111);
  assert.equal(payload.childStatusPath, 'data/generated/wiki-sync-progress.latest.json');
  assert.equal(payload.lastHeartbeatAt, '2026-06-04T00:01:00.000Z');
  assert.equal(payload.reportPath, '/repo/reports/projectile-zh-image-backfill-2026-06-04.json');
  assert.equal(payload.outputPath, '/repo/data/standardized/projectiles.standardized.json');
});

test('buildProjectileImageUploadRequest passes the resolved image source URL to upload', () => {
  const request = buildProjectileImageUploadRequest({
    sourceImageUrl: 'https://terraria.wiki.gg/images/Web.png',
    internalName: 'WebSlingerHook',
    managedUrlPrefix: 'http://localhost:9000/terrapedia-images/',
    apiBase: 'http://127.0.0.1:18088/api',
    authHeader: { Authorization: 'Bearer token' }
  });

  assert.deepEqual(request, {
    sourceUrl: 'https://terraria.wiki.gg/images/Web.png',
    nameHint: 'WebSlingerHook',
    managedUrlPrefix: 'http://localhost:9000/terrapedia-images/',
    apiBase: 'http://127.0.0.1:18088/api',
    authHeader: { Authorization: 'Bearer token' }
  });
});
