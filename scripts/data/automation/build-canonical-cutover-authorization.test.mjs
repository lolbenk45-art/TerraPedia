import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
  buildCanonicalAuthorizationRequestForOperation,
  hashOrderedBundleBytes,
  verifyCanonicalAuthorizationPacket,
} from './build-canonical-cutover-authorization.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const GENERATED_AT = '2026-07-27T15:00:00.000Z';
const EXPIRES_AT = '2026-07-28T15:00:00.000Z';

function technicalInput(overrides = {}) {
  return {
    operationId: 'canonical-schema-v56-v58',
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'server-uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    schemaEntries: [
      { path: 'back/src/main/resources/db/migration/V56.sql', bytes: 'CREATE TABLE a (id INT);\n' },
      { path: 'back/src/main/resources/db/migration/V57.sql', bytes: 'CREATE TABLE b (id INT);\n' },
      { path: 'back/src/main/resources/db/migration/V58.sql', bytes: 'CREATE TABLE c (id INT);\n' },
    ],
    dataEntries: [],
    policyRows: [{ domainId: 'biomes', policyVersion: 1, policyHash: HASH }],
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

test('authorization request freezes all technical identity and remains AWAITING_OWNER', () => {
  const request = buildCanonicalAuthorizationRequest(technicalInput());

  assert.equal(request.authorizationStatus, 'AWAITING_OWNER');
  assert.equal(request.operationId, 'canonical-schema-v56-v58');
  assert.match(request.serverFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(request.schemaBundleSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(request.dataBundleSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(request.policySetHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(request.requestHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(request.schemaBundleEntries.map((entry) => entry.path), [
    'back/src/main/resources/db/migration/V56.sql',
    'back/src/main/resources/db/migration/V57.sql',
    'back/src/main/resources/db/migration/V58.sql',
  ]);
  assert.ok(request.schemaBundleEntries.every((entry) => (
    Number.isInteger(entry.sizeBytes)
      && /^sha256:[a-f0-9]{64}$/.test(entry.contentHash)
      && !Object.hasOwn(entry, 'bytes')
  )));
  assert.deepEqual(request.dataBundleEntries, []);
  assert.deepEqual(request.missingTechnicalFields, []);
  assert.deepEqual(request.missingOwnerFields, [
    'actor', 'reason', 'authorizationReference', 'decisionIdentity',
  ]);
  assert.equal(request.actor, null);
  assert.equal(request.reason, null);
  assert.equal(request.authorizationReference, null);
  assert.equal(request.decisionIdentity, null);
});

test('ordered bundle hash binds exact path order, byte length, and bytes', () => {
  const entries = technicalInput().schemaEntries;
  const original = hashOrderedBundleBytes(entries, 'schema bundle');
  assert.notEqual(original, hashOrderedBundleBytes([...entries].reverse(), 'schema bundle'));
  assert.notEqual(original, hashOrderedBundleBytes([
    entries[0],
    { ...entries[1], bytes: `${entries[1].bytes} ` },
  ], 'schema bundle'));
  assert.throws(
    () => hashOrderedBundleBytes([{ path: '../escape.sql', bytes: 'x' }], 'schema bundle'),
    /normalized relative path/i,
  );
  assert.throws(
    () => hashOrderedBundleBytes([entries[0], entries[0]], 'schema bundle'),
    /duplicate/i,
  );
});

test('authorize requires exact Owner fields and unchanged request-bound technical inputs', () => {
  const request = buildCanonicalAuthorizationRequest(technicalInput());
  const owner = {
    actor: 'system-owner@example.test',
    reason: 'Approve the exact V56/V57/V58 schema bundle for formal cutover.',
    authorizationReference: 'decision://canonical-schema/2026-07-28',
    decisionIdentity: 'canonical-schema-decision-001',
    authorizedAt: '2026-07-27T16:00:00.000Z',
  };
  const currentTechnicalInput = technicalInput();
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    ...owner,
    currentTechnicalInput,
    usedDecisionIdentities: new Set(),
  });

  assert.equal(packet.authorizationStatus, 'AUTHORIZED');
  assert.equal(packet.requestHash, request.requestHash);
  assert.equal(packet.actor, owner.actor);
  assert.match(packet.packetHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(verifyCanonicalAuthorizationPacket(packet), true);

  for (const [name, mutation, pattern] of [
    ['empty actor', { actor: '' }, /actor/i],
    ['empty reason', { reason: '' }, /reason/i],
    ['empty reference', { authorizationReference: '' }, /authorization reference/i],
    ['empty decision', { decisionIdentity: '' }, /decision identity/i],
    ['request hash drift', { requestHash: HASH }, /request hash/i],
    ['operation drift', { currentTechnicalInput: technicalInput({ operationId: 'canonical-item-group-bootstrap' }) }, /operation/i],
    ['server drift', { currentTechnicalInput: technicalInput({ serverFingerprint: { ...technicalInput().serverFingerprint, serverUuid: 'changed' } }) }, /server fingerprint/i],
    ['schema drift', { currentTechnicalInput: technicalInput({ schemaEntries: [{ ...technicalInput().schemaEntries[0], bytes: 'changed' }] }) }, /schema bundle/i],
    ['data drift', { currentTechnicalInput: technicalInput({ dataEntries: [{ path: 'frozen/data.json', bytes: '{}' }] }) }, /data bundle/i],
    ['policy drift', { currentTechnicalInput: technicalInput({ policyRows: [{ domainId: 'biomes', policyVersion: 2, policyHash: HASH }] }) }, /policy set/i],
  ]) {
    assert.throws(() => authorizeCanonicalCutoverRequest({
      request,
      requestHash: request.requestHash,
      ...owner,
      currentTechnicalInput,
      usedDecisionIdentities: new Set(),
      ...mutation,
    }), pattern, name);
  }

  assert.throws(() => authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    ...owner,
    currentTechnicalInput,
    usedDecisionIdentities: new Set([owner.decisionIdentity]),
  }), /decision identity.*already used/i);
});

test('authorize rejects expired requests and missing technical identity', () => {
  const expired = buildCanonicalAuthorizationRequest(technicalInput({
    generatedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-26T00:00:00.000Z',
  }));
  assert.throws(() => authorizeCanonicalCutoverRequest({
    request: expired,
    requestHash: expired.requestHash,
    actor: 'owner',
    reason: 'operation-specific reason',
    authorizationReference: 'decision://expired',
    decisionIdentity: 'expired-decision',
    authorizedAt: '2026-07-27T00:00:00.000Z',
    currentTechnicalInput: technicalInput({
      generatedAt: '2026-07-25T00:00:00.000Z',
      expiresAt: '2026-07-26T00:00:00.000Z',
    }),
  }), /expired/i);

  const incomplete = buildCanonicalAuthorizationRequest(technicalInput({
    serverFingerprint: null,
    schemaEntries: null,
    dataEntries: null,
    policyRows: [],
  }));
  assert.deepEqual(incomplete.missingTechnicalFields, [
    'serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'policySetHash',
  ]);
  assert.throws(() => authorizeCanonicalCutoverRequest({
    request: incomplete,
    requestHash: incomplete.requestHash,
    actor: 'owner',
    reason: 'operation-specific reason',
    authorizationReference: 'decision://incomplete',
    decisionIdentity: 'incomplete-decision',
    authorizedAt: '2026-07-27T16:00:00.000Z',
    currentTechnicalInput: technicalInput(),
  }), /technical identity is incomplete/i);
});

test('authorize rejects an authorization timestamp before request generation', () => {
  const request = buildCanonicalAuthorizationRequest(technicalInput());
  assert.throws(() => authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'owner',
    reason: 'operation-specific reason',
    authorizationReference: 'decision://before-request',
    decisionIdentity: 'before-request-decision',
    authorizedAt: '2026-07-27T14:59:59.000Z',
    currentTechnicalInput: technicalInput(),
  }), /before.*request|request.*generated/i);
});

test('authorized packet rejects mutation of Owner and technical identity fields', () => {
  const request = buildCanonicalAuthorizationRequest(technicalInput());
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'system-owner@example.test',
    reason: 'Approve the exact V56/V57/V58 schema bundle for formal cutover.',
    authorizationReference: 'decision://canonical-schema/2026-07-28',
    decisionIdentity: 'canonical-schema-decision-002',
    authorizedAt: '2026-07-27T16:00:00.000Z',
    currentTechnicalInput: technicalInput(),
  });

  for (const [name, mutation] of [
    ['actor', { actor: 'different-owner@example.test' }],
    ['reason', { reason: 'Different operation reason.' }],
    ['authorization reference', { authorizationReference: 'decision://different' }],
    ['decision identity', { decisionIdentity: 'different-decision' }],
    ['operation', { operationId: 'canonical-item-group-bootstrap' }],
    ['server fingerprint', { serverFingerprint: HASH }],
    ['schema bundle', { schemaBundleSha256: HASH }],
    ['data bundle', { dataBundleSha256: HASH }],
    ['policy set', { policySetHash: HASH }],
    ['authorization time', { authorizedAt: '2026-07-27T16:00:01.000Z' }],
  ]) {
    assert.throws(
      () => verifyCanonicalAuthorizationPacket({ ...packet, ...mutation }),
      /packet hash|content mismatch/i,
      name,
    );
  }
});

test('operation request builder exposes all 17 independent stable IDs', () => {
  assert.deepEqual(CANONICAL_CUTOVER_OPERATION_IDS, [
    'automation-biomes-l0-bootstrap',
    'canonical-image-sync',
    'canonical-boss-import',
    'canonical-boss-loot-import',
    'canonical-projectile-backfill',
    'canonical-recipe-crawler',
    'canonical-recipe-apply',
    'canonical-shimmer-import',
    'canonical-schema-v56-v58',
    'canonical-item-group-bootstrap',
    'canonical-npc-crawler',
    'canonical-npc-apply',
    'automation-biomes-l1-policy-promotion',
    'automation-biomes-first-l1',
    'automation-biomes-second-l1',
    'automation-biomes-l2-promotion',
    'automation-biomes-scheduler-activation',
  ]);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorization-request-'));
  fs.mkdirSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'data', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V56__a.sql'), 'DDL-56');
  fs.writeFileSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V57__b.sql'), 'DDL-57');
  fs.writeFileSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V58__c.sql'), 'DDL-58');
  for (const name of ['recipe-material-reference.json', 'recipe-group-overrides.json', 'item-group-overrides.json']) {
    fs.writeFileSync(path.join(repoRoot, 'data', 'generated', name), `{\"name\":\"${name}\"}`);
  }

  const bootstrap = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'automation-biomes-l0-bootstrap',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.ok(!bootstrap.requiredTechnicalFields.includes('policySetHash'));
  assert.ok(!bootstrap.missingTechnicalFields.includes('policySetHash'));
  assert.ok(bootstrap.missingTechnicalFields.includes('executionManifestHash'));

  const schema = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-schema-v56-v58',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.match(schema.schemaBundleSha256, /^sha256:/);
  assert.match(schema.dataBundleSha256, /^sha256:/);
  assert.deepEqual(schema.schemaBundleEntries.map((entry) => entry.path), [
    'back/src/main/resources/db/migration/V56__a.sql',
    'back/src/main/resources/db/migration/V57__b.sql',
    'back/src/main/resources/db/migration/V58__c.sql',
  ]);
  assert.ok(schema.missingTechnicalFields.includes('serverFingerprint'));
  assert.ok(schema.missingTechnicalFields.includes('policySetHash'));

  const group = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-item-group-bootstrap',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.match(group.dataBundleSha256, /^sha256:/);
  assert.deepEqual(group.dataBundleEntries.map((entry) => entry.path), [
    'data/generated/recipe-material-reference.json',
    'data/generated/recipe-group-overrides.json',
    'data/generated/item-group-overrides.json',
  ]);

  const npc = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.match(npc.dataBundleSha256, /^sha256:/);
  assert.deepEqual(npc.dataBundleEntries, []);
  assert.equal(npc.executionManifestHash, null);
  assert.ok(npc.missingTechnicalFields.includes('executionManifestHash'));

  const secondL1 = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'automation-biomes-second-l1',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.equal(secondL1.operationId, 'automation-biomes-second-l1');
  assert.ok(secondL1.requiredTechnicalFields.includes('dataBundleSha256'));
});

test('operation-specific execution manifests are hash-bound and drift is rejected', () => {
  const currentTechnicalInput = technicalInput({
    executionManifest: {
      schemaVersion: 1,
      command: ['node', 'scripts/data/fetch/example.mjs', '--limit=10'],
      outputPaths: ['data/generated/example.latest.json'],
      progressPath: 'data/generated/wiki-sync-progress.latest.json',
    },
    requiredTechnicalFields: [
      'serverFingerprint',
      'schemaBundleSha256',
      'dataBundleSha256',
      'policySetHash',
      'executionManifestHash',
    ],
  });
  const request = buildCanonicalAuthorizationRequest(currentTechnicalInput);
  assert.match(request.executionManifestHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(request.executionManifest.command, currentTechnicalInput.executionManifest.command);

  assert.throws(() => authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'owner',
    reason: 'approve exact execution manifest',
    authorizationReference: 'decision://manifest/1',
    decisionIdentity: 'manifest-decision-1',
    authorizedAt: '2026-07-27T16:00:00.000Z',
    currentTechnicalInput: {
      ...currentTechnicalInput,
      executionManifest: {
        ...currentTechnicalInput.executionManifest,
        command: ['node', 'scripts/data/fetch/example.mjs', '--limit=11'],
      },
    },
  }), /execution manifest.*drift/i);
});

test('operation request builder verifies manifest code hashes against current repo bytes', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorization-code-'));
  const codePath = 'scripts/data/fetch/example.mjs';
  fs.mkdirSync(path.join(repoRoot, path.dirname(codePath)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, codePath), 'export const value = 1;\n');
  const baseManifest = {
    schemaVersion: 1,
    command: ['node', codePath, '--limit=1'],
    codeBundleEntries: [{
      path: codePath,
      contentHash: `sha256:${'0'.repeat(64)}`,
    }],
    outputPaths: ['data/generated/example.latest.json'],
    progressPaths: ['data/generated/wiki-sync-progress.latest.json'],
  };

  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: baseManifest,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /code bundle.*hash mismatch/i);

  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: {
      ...baseManifest,
      command: ['node', 'scripts/data/fetch/unbound-entrypoint.mjs', '--limit=1'],
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /command entrypoint.*code bundle/i);

  const contentHash = `sha256:${createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, codePath)))
    .digest('hex')}`;
  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: {
      ...baseManifest,
      codeBundleEntries: [{ path: codePath, contentHash }],
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.match(request.executionManifestHash, /^sha256:/);
});
