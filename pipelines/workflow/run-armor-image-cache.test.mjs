import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as runner from './run-armor-image-cache.mjs';
import { buildArmorImageCacheProposal } from './armor-image-cache.mjs';
import { resolveManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';
import { buildCanonicalOperationExecutionManifest } from '../automation/canonical-operation-execution-manifest.mjs';
import { buildCanonicalAuthorizationRequestForOperation, authorizeCanonicalCutoverRequest, resolveCanonicalOperationTechnicalInput } from '../automation/build-canonical-cutover-authorization.mjs';
import { createAuthorizedOperationDispatchPermit } from '../automation/authorized-operation-context.mjs';
import { consumeDecisionIdentityFile } from '../automation/run-authorized-canonical-operation.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';

const operationId = 'canonical-armor-image-cache';
test('cache apply cannot open DB or network without a governed context', async () => {
  assert.equal(typeof runner.applyArmorImageCache, 'function');
  let calls = 0;
  await assert.rejects(runner.applyArmorImageCache({ resultLabel: 'no-auth', env: {},
    mysqlModule: { createConnection() { calls++; } }, fetchImpl() { calls++; } }), /packet|authorization/i);
  assert.equal(calls, 0);
});

for (const cleanupFailure of [null, 'rollback', 'end']) test(`registered cache runner handles permit, replay and cleanup ${cleanupFailure ?? 'success'}`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-cache-runner-'));
  try {
    const sourceRoot = path.resolve(import.meta.dirname, '../..'); const resultLabel = 'runner-01';
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: sourceRoot, operationId, resultLabel });
    for (const entry of manifest.codeBundleEntries) { const dest = path.join(root, entry.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(sourceRoot, entry.path), dest); }
    const write = (p, x) => writeJsonNoOverwrite(path.join(root, p), x);
    write('platform/local/config/local-stack.config.json', { database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test' },
      auth: { admin: { username: 'admin', password: 'test' } }, minio: { endpoint: 'http://127.0.0.1:19000', publicEndpoint: 'http://localhost:19000', bucket: 'terrapedia-images' } });
    const now = new Date(Date.now() - 5000).toISOString();
    const bytes = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');
    const info = { fileTitle: 'File:Wood.png', url: 'https://terraria.wiki.gg/images/Wood.png', revisionTimestamp: '2022-01-02T00:00:00Z', mime: 'image/png', width: 1, height: 1, size: bytes.length };
    const sourcePayload = { source: 'terraria.wiki.gg:armor-set-pages:imageinfo', sourceApi: 'https://terraria.wiki.gg/api.php', sourcePageTitle: 'Armor set pages', sourceRevisionTimestamp: null, fetchedAt: now, totalArmorSets: 1, totalArmorSetImages: 1, warnings: [],
      armorSetImages: [{ textKey: 'ArmorSetBonus.Wood', imageRole: 'part', pageTitle: 'Wood armor', sourceFileTitle: 'Wood.png', originalUrl: info.url, cachedUrl: null, sourceRevisionTimestamp: info.revisionTimestamp, contentType: info.mime, width: 1, height: 1, isPrimary: false, sortOrder: 0, raw: { imageInfo: info } }] };
    const proposal = buildArmorImageCacheProposal({ sourcePayload, downloads: [{ sourceFileTitle: 'Wood.png', before: info, after: info, bytesBase64: bytes.toString('base64') }], managedImageUrlPrefixes: resolveManagedImageUrlPrefixes({ repoRoot: root }), generatedAt: now });
    write(manifest.inputPaths[0], proposal);
    const fingerprint = { host: '127.0.0.1', port: 13306, serverUuid: 'test-server', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] };
    const policies = [{ domainId: 'armor_sets', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
    const technical = { ...resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest }), serverFingerprint: fingerprint, policyRows: policies };
    const request = buildCanonicalAuthorizationRequestForOperation({ repoRoot: root, operationId, executionManifest: manifest, serverFingerprint: fingerprint, policyRows: policies, generatedAt: now, expiresAt: new Date(Date.now() + 60000).toISOString() });
    const packet = authorizeCanonicalCutoverRequest({ request, requestHash: request.requestHash, actor: 'admin', reason: 'isolated test', authorizationReference: 'test://cache', decisionIdentity: 'cache-runner-01', currentTechnicalInput: technical, authorizedAt: now });
    write('packet.json', packet); const permit = createAuthorizedOperationDispatchPermit({ directory: root, packet });
    consumeDecisionIdentityFile({ ledgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'), decisionIdentity: packet.decisionIdentity, dispatchPermitHash: permit.dispatchPermitHash });
    const env = { TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.join(root, 'packet.json'), TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path,
      TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce, TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: JSON.stringify(fingerprint) };
    let posts = 0; const sqls = [];
    const connection = { beginTransaction: async () => {}, rollback: async () => { if (cleanupFailure === 'rollback') throw new Error('rollback failed'); }, end: async () => { if (cleanupFailure === 'end') throw new Error('end failed'); },
      async query(sql) { sqls.push(sql);
        if (sql.includes('@@server_uuid')) return [[{ serverUuid: 'test-server', serverPort: 13306, databaseName: 'terria_v1_local', timezoneOffsetMinutes: 480, nowUtc: new Date().toISOString().slice(0, 19).replace('T', ' ') }]];
        if (sql.includes('crawler_automation_owner')) return [[{ username: 'admin', status: 'ACTIVE' }]];
        if (sql.includes('crawler_automation_policy p')) return [policies];
        if (sql.includes('crawler_automation_write_fence')) return [[]];
        throw new Error(`unexpected SQL ${sql}`);
      } };
    const fetchImpl = async (url, options = {}) => {
      if (String(url).endsWith('/auth/login')) return Response.json({ data: { token: 'test-token' } });
      if (String(url).endsWith('/automation/preflight')) return Response.json({ success: true, data: { control: { enabled: false }, counts: { liveAttempts: 0, sweepClaims: 0 }, reconciler: { status: 'healthy', failureCount: 0, overdueAttemptCount: 0 }, policySetHash: packet.policySetHash } });
      if (String(url).endsWith('/files/images')) { assert.equal(options.method, 'POST'); assert.ok(fs.existsSync(path.join(root, manifest.outputPaths[0]))); posts++; return Response.json({ success: true, data: { url: '/terrapedia-images/items/cache.png' } }); }
      assert.equal(String(url), 'http://127.0.0.1:19000/terrapedia-images/items/cache.png');
      return new Response(bytes);
    };
    const args = { repoRoot: root, resultLabel, env, mysqlModule: { createConnection: async () => connection }, fetchImpl };
    if (cleanupFailure) {
      await assert.rejects(runner.applyArmorImageCache(args), new RegExp(`${cleanupFailure} failed`));
      const progress = JSON.parse(fs.readFileSync(path.join(root, runner.buildArmorImageCachePaths(resultLabel).progressPath)));
      assert.equal(progress.status, 'failed');
    } else {
      const result = await runner.applyArmorImageCache(args);
      assert.equal(result.status, 'COMPLETED');
    }
    assert.equal(posts, 1);
    assert.ok(sqls.every(sql => sql.startsWith('SELECT ')));
    for (const p of manifest.outputPaths) assert.equal(fs.statSync(path.join(root, p)).mode & 0o077, 0);
    const persisted = JSON.parse(fs.readFileSync(path.join(root, manifest.outputPaths[1])));
    const events = fs.readFileSync(path.join(root, runner.buildArmorImageCachePaths(resultLabel).journalPath), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => event.phase), ['UPLOAD_INTENT', 'UPLOAD_RECEIVED', 'CACHE_VERIFIED']);
    assert.deepEqual(events.map(event => event.sequence), [1, 2, 3]);
    assert.ok(events.every(event => event.authorization.decisionIdentity === packet.decisionIdentity));
    assert.equal(persisted.authorization.decisionIdentity, packet.decisionIdentity);
    assert.equal(persisted.payload.armorSetImages[0].imageRole, 'part');
    await assert.rejects(runner.applyArmorImageCache(args), /used|consumed|exists|permit/i);
    assert.equal(posts, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Armor image progress reaches the dedicated monitor data root and retains private custom progress', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-image-progress-'));
  const monitor = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-image-monitor-root-'));
  try {
    assert.equal(typeof runner.writeArmorImageCacheProgress, 'function');
    const payload = { actionId: 'armor-set-images', status: 'running', phase: 'verify-image-bytes',
      current: 1, total: 2, generatedAt: '2026-09-27T08:00:00Z', lastHeartbeatAt: '2026-09-27T08:00:00Z', message: 'verified 1/2' };
    runner.writeArmorImageCacheProgress({ repoRoot: root, monitorRoot: monitor, progressPath: 'reports/test/source-status.json', payload });
    for (const file of [path.join(root, 'reports/test/source-status.json'), path.join(monitor, 'data/generated/armor-image-cache-progress.latest.json')]) {
      assert.equal(JSON.parse(fs.readFileSync(file)).current, 1);
    }
    runner.writeArmorImageCacheProgress({ repoRoot: root, payload: { ...payload, status: 'completed' } });
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/generated/armor-image-cache-progress.latest.json'))).status, 'completed');
    assert.throws(() => runner.writeArmorImageCacheProgress({ repoRoot: root, progressPath: '../escape.json', payload }), /outside|escape|repository/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(monitor, { recursive: true, force: true }); }
});
