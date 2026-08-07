import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
  buildCanonicalAuthorizationRequestForOperation,
  hashOrderedBundleBytes,
  readUsedDecisionIdentities,
  resolveCanonicalOperationTechnicalInput,
  verifyCanonicalAuthorizationPacket,
} from './build-canonical-cutover-authorization.mjs';
import {
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';
import {
  assertItemImageProjectionSnapshot,
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionProposal,
  buildItemImageProjectionSnapshot,
  canonicalItemImageProjectionHash,
  recomputeItemImageProjectionPacketHash,
} from '../relation/item-image-projection-contract.mjs';

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

  // The durable ledger holds two shapes: bare identity strings, and the
  // `{decisionIdentity, dispatchPermitHash}` records the dispatch side writes.
  // A Set built straight from the ledger therefore contains objects, which no
  // string lookup can ever match — so a decision already recorded in record
  // form could be signed a second time.
  assert.throws(() => authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    ...owner,
    currentTechnicalInput,
    usedDecisionIdentities: new Set([
      { decisionIdentity: owner.decisionIdentity, dispatchPermitHash: HASH },
    ]),
  }), /decision identity.*already used/i);
});

test('used decision identities are read from both durable ledger shapes', () => {
  assert.deepEqual(
    [...readUsedDecisionIdentities([
      'canonical-image-sync-20260801-04',
      { decisionIdentity: 'canonical-npc-t1-acceptance-20260730-01', dispatchPermitHash: HASH },
      { dispatchPermitHash: HASH },
      '',
      null,
    ])].sort(),
    ['canonical-image-sync-20260801-04', 'canonical-npc-t1-acceptance-20260730-01'],
  );
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

test('operation request builder exposes all 38 stable governed IDs', () => {
  assert.deepEqual(CANONICAL_CUTOVER_OPERATION_IDS, [
    'automation-biomes-l0-bootstrap',
    'canonical-item-image-source-verification',
    'canonical-item-image-source-promotion',
    'canonical-item-image-lineage-apply',
    'canonical-item-image-projection-apply',
    'canonical-item-image-projection-missing-row-insert',
    'canonical-item-base-entity-restoration',
    'canonical-image-sync',
    'canonical-boss-import',
    'canonical-boss-loot-import',
    'canonical-projectile-backfill',
    'canonical-recipe-crawler',
    'canonical-recipe-apply',
    'canonical-recipe-t1-acceptance',
    'canonical-shimmer-generation',
    'canonical-shimmer-import',
    'canonical-schema-v56-v58',
    'canonical-item-group-bootstrap',
    'canonical-npc-crawler',
    'canonical-npc-t1-acceptance',
    'canonical-npc-t2-cutover-verification',
    'canonical-npc-apply',
    'canonical-npc-landing-apply',
    'canonical-npc-facts-maint-apply',
    'canonical-npc-item-relations-apply',
    'canonical-npc-buff-relations-apply',
    'canonical-npc-town-shop-projection-apply',
    'canonical-npc-buff-projection-apply',
    'canonical-npc-nonboss-loot-projection-apply',
    'canonical-npc-boss-loot-projection-apply',
    'automation-biomes-l1-policy-promotion',
    'automation-biomes-first-l1',
    'automation-biomes-second-l1',
    'automation-biomes-l2-promotion',
    'automation-biomes-scheduler-activation',
    'canonical-npc-base-maint-nontown-apply',
    'canonical-npc-base-maint-town-apply',
    'canonical-npc-item-relation-lineage-repair',
  ]);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorization-request-'));
  fs.mkdirSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'data', 'generated'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'data', 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'reports', 'authorization', 'canonical'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V56__a.sql'), 'DDL-56');
  fs.writeFileSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V57__b.sql'), 'DDL-57');
  fs.writeFileSync(path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', 'V58__c.sql'), 'DDL-58');
  for (const name of ['recipe-material-reference.json', 'recipe-group-overrides.json', 'item-group-overrides.json']) {
    fs.writeFileSync(path.join(repoRoot, 'data', 'generated', name), `{\"name\":\"${name}\"}`);
  }
  fs.writeFileSync(path.join(repoRoot, 'data', 'standardized', 'items.standardized.json'), '{"records":[]}');
  fs.writeFileSync(path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'), '{"records":[]}');
  fs.writeFileSync(
    path.join(
      repoRoot,
      'reports',
      'authorization',
      'canonical',
      'canonical-shimmer-generation.input.json'
    ),
    '{"schemaVersion":1,"operationId":"canonical-shimmer-generation"}',
  );
  fs.writeFileSync(
    path.join(
      repoRoot,
      'reports',
      'authorization',
      'canonical',
      'canonical-item-image-source-verification.input.json'
    ),
    '{"records":[],"constraints":{"batchSize":8,"maxRequests":877}}',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'reports', 'authorization', 'canonical', 'canonical-item-group-bootstrap.input.json'),
    '{"operationId":"canonical-item-group-bootstrap"}',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'reports', 'authorization', 'canonical', 'canonical-npc-crawler.targets.json'),
    '{"targets":[]}',
  );

  const bootstrap = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'automation-biomes-l0-bootstrap',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.ok(!bootstrap.requiredTechnicalFields.includes('policySetHash'));
  assert.ok(!bootstrap.missingTechnicalFields.includes('policySetHash'));
  assert.ok(bootstrap.missingTechnicalFields.includes('executionManifestHash'));

  const itemImageVerification = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-item-image-source-verification',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.deepEqual(itemImageVerification.dataBundleEntries.map((entry) => entry.path), [
    'reports/authorization/canonical/canonical-item-image-source-verification.input.json',
  ]);
  assert.ok(itemImageVerification.missingTechnicalFields.includes('executionManifestHash'));

  const shimmerGeneration = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-shimmer-generation',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.deepEqual(shimmerGeneration.dataBundleEntries.map((entry) => entry.path), [
    'reports/authorization/canonical/canonical-shimmer-generation.input.json',
    'data/standardized/items.standardized.json',
    'data/standardized/npcs.standardized.json',
  ]);
  assert.ok(shimmerGeneration.missingTechnicalFields.includes('executionManifestHash'));

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
    'reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
    'data/generated/recipe-material-reference.json',
    'data/generated/recipe-group-overrides.json',
    'data/generated/item-group-overrides.json',
    'data/standardized/items.standardized.json',
  ]);

  const npc = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.match(npc.dataBundleSha256, /^sha256:/);
  assert.deepEqual(npc.dataBundleEntries.map((entry) => entry.path), [
    'reports/authorization/canonical/canonical-npc-crawler.targets.json',
  ]);
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

test('every operation resolves its exact frozen data inputs and fails closed when one is missing', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-operation-data-'));
  const write = (relativePath, content = '{}') => {
    const filePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };
  for (const paths of Object.values(CANONICAL_OPERATION_DATA_PATHS)) {
    for (const relativePath of paths) {
      if (relativePath === 'reports/authorization/canonical/canonical-shimmer-import.input.json') continue;
      write(relativePath, `{"path":"${relativePath}"}`);
    }
  }
  writeShimmerImportContract(repoRoot);
  fs.rmSync(path.join(
    repoRoot,
    'reports/authorization/canonical/canonical-npc-apply.input.json',
  ));
  write('back/src/main/resources/db/migration/V56__a.sql', 'DDL-56');
  write('back/src/main/resources/db/migration/V57__b.sql', 'DDL-57');
  write('back/src/main/resources/db/migration/V58__c.sql', 'DDL-58');

  for (const operationId of CANONICAL_CUTOVER_OPERATION_IDS) {
    if (operationId === 'canonical-item-image-lineage-apply'
        || operationId === 'canonical-item-image-projection-apply'
        || operationId === 'canonical-item-image-projection-missing-row-insert'
        || operationId === 'canonical-item-base-entity-restoration') continue;
    const request = buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId,
      generatedAt: GENERATED_AT,
      expiresAt: EXPIRES_AT,
    });
    const expectedPaths = operationId === 'canonical-npc-t1-acceptance'
      || operationId === 'canonical-npc-t2-cutover-verification'
      || operationId === 'canonical-npc-apply'
      || operationId.startsWith('canonical-npc-') && operationId.endsWith('-apply')
      || operationId === 'canonical-npc-item-relation-lineage-repair'
      ? undefined
      : CANONICAL_OPERATION_DATA_PATHS[operationId];
    assert.deepEqual(
      request.dataBundleEntries?.map((entry) => entry.path),
      expectedPaths,
      operationId,
    );
  }

  const missingPath = CANONICAL_OPERATION_DATA_PATHS['canonical-shimmer-import'][0];
  fs.rmSync(path.join(repoRoot, missingPath));
  const incomplete = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-shimmer-import',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.equal(incomplete.dataBundleSha256, null);
  assert.equal(incomplete.dataBundleEntries, null);
  assert.ok(incomplete.missingTechnicalFields.includes('dataBundleSha256'));
});

test('lineage authorization binds the fresh attempt input and bundle paths', () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../../..');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-lineage-attempt-request-'));
  fs.cpSync(path.join(sourceRoot, 'scripts'), path.join(repoRoot, 'scripts'), { recursive: true });
  const attemptRoot = 'reports/authorization/canonical/item-image-lineage-apply/'
    + 'b'.repeat(64);
  const write = (relativePath, value, mode = 0o600) => {
    const output = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value)}\n`);
    fs.writeFileSync(output, bytes, { mode });
    fs.chmodSync(output, mode);
    return { output, bytes };
  };
  const bundleBytes = Buffer.from(`${JSON.stringify({
    entity: 'item_image_lineage_bundle',
    datasetType: 'item_image_sources_raw',
  })}\n`);
  const bundleSha256 = `sha256:${createHash('sha256').update(bundleBytes).digest('hex')}`;
  write(`${attemptRoot}/bundle.json`, bundleBytes, 0o644);
  write(`${attemptRoot}/input.json`, {
    schemaVersion: 1,
    operationId: 'canonical-item-image-lineage-apply',
    lineageBundle: {
      path: `${attemptRoot}/bundle.json`,
      sha256: bundleSha256,
    },
  });
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-lineage-apply',
    artifactDate: '2026-08-05',
    itemImageLineageAttemptRoot: attemptRoot,
  });

  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-item-image-lineage-apply',
    executionManifest: manifest,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.deepEqual(request.dataBundleEntries?.map((entry) => entry.path), [
    `${attemptRoot}/input.json`,
    `${attemptRoot}/bundle.json`,
  ]);
});

test('shimmer authorization binds one private input contract and cannot reuse the legacy null-bundle request', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-contract-request-'));
  try {
    const contractPath = path.join(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.input.json',
    );
    const missing = buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId: 'canonical-shimmer-import',
      generatedAt: GENERATED_AT,
      expiresAt: EXPIRES_AT,
    });
    assert.equal(missing.dataBundleSha256, null);
    assert.ok(missing.missingTechnicalFields.includes('dataBundleSha256'));

    const publication = writeShimmerImportContract(repoRoot);
    const request = buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId: 'canonical-shimmer-import',
      generatedAt: GENERATED_AT,
      expiresAt: EXPIRES_AT,
    });
    assert.deepEqual(request.dataBundleEntries?.map((entry) => entry.path), [
      'reports/authorization/canonical/canonical-shimmer-import.input.json',
    ]);
    assert.match(request.dataBundleSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(request.dataBundleEntries.some((entry) => /wiki-shimmer.*latest/.test(entry.path)), false);
    assert.equal(publication.manifest.generationId, JSON.parse(fs.readFileSync(contractPath, 'utf8')).generationId);

    fs.rmSync(contractPath);
    for (const legacyPath of [
      'data/generated/wiki-shimmer.latest.json',
      'data/generated/shimmer/wiki-shimmer-context.importable.latest.json',
      'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json',
    ]) {
      fs.mkdirSync(path.dirname(path.join(repoRoot, legacyPath)), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, legacyPath), '{"legacy":true}\n');
    }
    const stale = buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId: 'canonical-shimmer-import',
      generatedAt: GENERATED_AT,
      expiresAt: EXPIRES_AT,
    });
    assert.equal(stale.dataBundleSha256, null);
    assert.equal(stale.dataBundleEntries, null);
    assert.ok(stale.missingTechnicalFields.includes('dataBundleSha256'));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC apply request follows only the exact frozen input pairs and ignores unrelated crawler history', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-apply-data-'));
  const write = (relativePath, content) => {
    const filePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return Buffer.from(content);
  };
  write('data/standardized/npcs.standardized.json', '{"records":[]}\n');
  const targetPath = 'reports/authorization/canonical/canonical-npc-crawler.targets.json';
  write(targetPath, '{"targets":[]}\n');
  const evidencePairs = [];
  const expectedPairPaths = [];
  for (let index = 1; index <= 25; index += 1) {
    const entityId = `npc-${index}`;
    const normalizedPath = `data/wiki-crawler/normalized-light/npc/${entityId}.latest.json`;
    const auditPath = `data/wiki-crawler/audit/npc/${entityId}.latest.json`;
    const normalizedBytes = write(normalizedPath, `{"entityId":"${entityId}"}\n`);
    const auditBytes = write(auditPath, `{"entityId":"${entityId}","status":"pass"}\n`);
    const summary = (entryPath, bytes) => ({
      path: entryPath,
      contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      sizeBytes: bytes.length,
    });
    evidencePairs.push({
      entityId,
      normalized: summary(normalizedPath, normalizedBytes),
      audit: summary(auditPath, auditBytes),
    });
    expectedPairPaths.push(normalizedPath, auditPath);
  }
  write('data/wiki-crawler/normalized-light/npc/historical.latest.json', '{"old":true}\n');
  write('data/wiki-crawler/audit/npc/historical.latest.json', '{"old":true}\n');
  const inputPath = 'reports/authorization/canonical/canonical-npc-apply.input.json';
  write(inputPath, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'canonical-npc-apply',
    targetManifest: {
      path: targetPath,
      contentHash: `sha256:${createHash('sha256').update(fs.readFileSync(path.join(repoRoot, targetPath))).digest('hex')}`,
      sizeBytes: fs.statSync(path.join(repoRoot, targetPath)).size,
    },
    pairCount: 25,
    evidencePairs,
  })}\n`);

  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-apply',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.deepEqual(request.dataBundleEntries.map((entry) => entry.path), [
    inputPath,
    'data/standardized/npcs.standardized.json',
    targetPath,
    ...expectedPairPaths,
  ]);
  assert.equal(request.dataBundleEntries.some((entry) => entry.path.includes('historical')), false);

  const landingResultPath = 'reports/authorization/canonical/canonical-npc-landing-apply.result.json';
  write(landingResultPath, '{"operationId":"canonical-npc-landing-apply","status":"COMPLETED"}\n');
  for (const operationId of [
    'canonical-npc-base-maint-nontown-apply',
    'canonical-npc-base-maint-town-apply',
  ]) {
    const baseRequest = buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId,
      generatedAt: GENERATED_AT,
      expiresAt: EXPIRES_AT,
    });
    assert.deepEqual(baseRequest.dataBundleEntries.map((entry) => entry.path), [
      inputPath,
      landingResultPath,
      'data/standardized/npcs.standardized.json',
      targetPath,
      ...expectedPairPaths,
    ]);
  }

  const maintResultPath = 'reports/authorization/canonical/canonical-npc-facts-maint-apply.result.json';
  const itemRelationResultPath = 'reports/authorization/canonical/canonical-npc-item-relations-apply.result.json';
  write(maintResultPath, '{"operationId":"canonical-npc-facts-maint-apply","status":"COMPLETED"}\n');
  write(itemRelationResultPath, '{"operationId":"canonical-npc-item-relations-apply","status":"COMPLETED"}\n');
  const repairRequest = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-item-relation-lineage-repair',
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.deepEqual(repairRequest.dataBundleEntries.map((entry) => entry.path), [
    inputPath,
    landingResultPath,
    maintResultPath,
    itemRelationResultPath,
    targetPath,
    ...expectedPairPaths,
  ]);
});

test('operation manifests are bound to the exact governed entrypoint and missing executors stay closed', () => {
  assert.deepEqual(Object.keys(CANONICAL_OPERATION_ENTRYPOINTS), CANONICAL_CUTOVER_OPERATION_IDS);
  assert.deepEqual(
    Object.entries(CANONICAL_OPERATION_ENTRYPOINTS)
      .filter(([, entrypoint]) => entrypoint === null)
      .map(([operationId]) => operationId),
    ['canonical-npc-apply'],
  );

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-operation-entrypoint-'));
  const wrongPath = 'scripts/data/fetch/wrong.mjs';
  fs.mkdirSync(path.join(repoRoot, path.dirname(wrongPath)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, wrongPath), 'export const wrong = true;\n');
  const contentHash = `sha256:${createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, wrongPath)))
    .digest('hex')}`;
  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-image-sync',
    executionManifest: {
      schemaVersion: 1,
      operationId: 'canonical-image-sync',
      command: ['node', wrongPath, '--apply=true'],
      codeBundleEntries: [{ path: wrongPath, contentHash }],
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /entrypoint must be scripts\/data\/workflow\/run-image-sync\.mjs/i);

  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-apply',
    executionManifest: {
      schemaVersion: 1,
      operationId: 'canonical-npc-apply',
      command: ['node', wrongPath],
      codeBundleEntries: [{ path: wrongPath, contentHash }],
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /no governed executor/i);
});

test('operation request builder rejects safe-entrypoint manifests whose exact arguments drift', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const recipe = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    artifactDate: '2026-07-28',
  });
  const mutatedRecipe = {
    ...recipe,
    command: recipe.command.map((value) => (
      value === '--max-depth=1' ? '--max-depth=2' : value
    )),
    bounds: { ...recipe.bounds, maxDepth: 2 },
  };
  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: mutatedRecipe,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /execution manifest contract.*drift/i);

  const npc = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    artifactDate: '2026-07-28',
    npcLimit: 25,
  });
  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    executionManifest: {
      ...npc,
      command: npc.command.map((value) => value === '--limit=25' ? '--limit=500' : value),
      bounds: { ...npc.bounds, targetLimit: 500 },
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /npcLimit.*exactly 25|execution manifest contract.*drift/i);
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
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const baseManifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    artifactDate: '2026-07-28',
  });

  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: {
      ...baseManifest,
      codeBundleEntries: baseManifest.codeBundleEntries.map((entry, index) => (
        index === 0 ? { ...entry, contentHash: `sha256:${'0'.repeat(64)}` } : entry
      )),
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /code bundle.*hash mismatch/i);

  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: {
      ...baseManifest,
      command: baseManifest.command.map((value, index) => (
        index === 1 ? 'scripts/data/fetch/unbound-entrypoint.mjs' : value
      )),
    },
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /execution manifest entrypoint must be/i);

  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    executionManifest: baseManifest,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  }), /manifest operationId.*canonical-npc-crawler/i);

  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    executionManifest: baseManifest,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
  });
  assert.match(request.executionManifestHash, /^sha256:/);
});

test('NPC T1 request binds only isolated-acceptance technical fields and rejects private config drift', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-request-'));
  const configPath = path.join(configDirectory, 'local-stack.json');
  try {
    const serverFingerprint = {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'server-uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    };
    fs.writeFileSync(configPath, `${JSON.stringify({
      database: { host: '127.0.0.1', port: 13306 },
      redis: { port: 6379 },
      npcT1ServerFingerprint: serverFingerprint,
    })}\n`, { mode: 0o600 });
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-npc-t1-acceptance',
      artifactDate: '2026-07-30',
      npcT1ConfigPath: configPath,
      npcT1RedisDb: 9,
      npcT1RunId: 'npc-t1-20260730-01',
    });
    const options = {
      repoRoot,
      operationId: 'canonical-npc-t1-acceptance',
      executionManifest: manifest,
      serverFingerprint,
      generatedAt: GENERATED_AT,
      expiresAt: EXPIRES_AT,
    };
    const request = buildCanonicalAuthorizationRequestForOperation(options);
    assert.deepEqual(request.requiredTechnicalFields, [
      'serverFingerprint',
      'dataBundleSha256',
      'executionManifestHash',
    ]);
    assert.deepEqual(request.schemaBundleEntries, []);
    assert.equal(request.policySetHash, null);

    assert.throws(
      () => buildCanonicalAuthorizationRequestForOperation({
        ...options,
        serverFingerprint: { ...serverFingerprint, port: 13307 },
      }),
      /isolated.*server.*identity|server.*fingerprint/i,
    );

    fs.writeFileSync(configPath, `${JSON.stringify({
      database: { host: '127.0.0.1', port: 13306 },
      redis: { port: 6380 },
      npcT1ServerFingerprint: serverFingerprint,
    })}\n`, { mode: 0o600 });
    assert.throws(
      () => buildCanonicalAuthorizationRequestForOperation(options),
      /config.*hash|config.*drift/i,
    );
  } finally {
    fs.rmSync(configDirectory, { recursive: true, force: true });
  }
});

test('item image projection authorization expands and verifies the complete frozen data bundle', () => {
  const fixture = createProjectionAuthorizationFixture();
  try {
    const request = buildProjectionAuthorizationRequest(fixture);
    assert.deepEqual(request.executionManifest.inputPaths, [fixture.paths.inputPath]);
    assert.deepEqual(request.dataBundleEntries.map((entry) => entry.path), fixture.dataPaths);
    assert.equal(request.dataBundleEntries.some((entry) => (
      entry.path === 'reports/authorization/canonical/used-decisions.json'
    )), false);
    assert.equal(request.dataBundleSha256, hashOrderedBundleBytes(
      fixture.dataPaths.map((entryPath) => ({
        path: entryPath,
        bytes: fs.readFileSync(path.join(fixture.repoRoot, entryPath)),
      })),
      'data bundle',
    ));
    assert.equal(
      request.executionManifest.itemImageProjectionAttempt.inputBinding.lineage.decisionIdentity,
      fixture.input.lineage.decisionIdentity,
    );
    assert.equal(
      request.executionManifest.itemImageProjectionAttempt.inputBinding.lineage.dispatchPermitHash,
      fixture.input.lineage.dispatchPermitHash,
    );

    const proposalPath = path.join(fixture.repoRoot, fixture.paths.proposalPath);
    fs.appendFileSync(proposalPath, ' ');
    assert.throws(() => buildProjectionAuthorizationRequest(fixture), /proposal.*hash|bundle.*drift/i);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection authorization rejects private, packet, and confinement drift', () => {
  for (const mutate of [
    (fixture) => fs.chmodSync(path.join(fixture.repoRoot, fixture.paths.snapshotPath), 0o644),
    (fixture) => fs.chmodSync(path.join(
      fixture.repoRoot,
      fixture.input.lineage.inputContractPath,
    ), 0o644),
    (fixture) => fs.chmodSync(path.join(
      fixture.repoRoot,
      fixture.input.lineage.resultPath,
    ), 0o644),
    (fixture) => fs.chmodSync(path.join(
      fixture.repoRoot,
      fixture.input.lineage.applySnapshotPath,
    ), 0o644),
    (fixture) => {
      const packetPath = path.join(fixture.repoRoot, fixture.historicalPacketPath);
      const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
      fs.writeFileSync(packetPath, JSON.stringify({ ...packet, actor: 'different-owner' }), { mode: 0o600 });
    },
    (fixture) => {
      const ownerPath = path.join(fixture.repoRoot, fixture.paths.proposalReadOwnerInputPath);
      const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
      fs.writeFileSync(ownerPath, JSON.stringify({ ...owner, reason: 'drifted' }), { mode: 0o600 });
    },
  ]) {
    const fixture = createProjectionAuthorizationFixture();
    try {
      mutate(fixture);
      assert.throws(
        () => buildProjectionAuthorizationRequest(fixture),
        /private|packet|content hash|authorization|bundle|hash/i,
      );
    } finally {
      fixture.cleanup();
    }
  }

  const fixture = createProjectionAuthorizationFixture();
  try {
    const bundlePath = path.join(fixture.repoRoot, fixture.input.lineage.bundlePath);
    fs.rmSync(bundlePath);
    fs.symlinkSync('/etc/hosts', bundlePath);
    assert.throws(() => buildProjectionAuthorizationRequest(fixture), /ordinary|symbolic|confinement|bundle/i);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection authorization requires the manifest as its sole dynamic root', () => {
  const fixture = createProjectionAuthorizationFixture();
  try {
    assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-item-image-projection-apply',
      serverFingerprint: fixture.serverFingerprint,
      policyRows: fixture.policyRows,
      generatedAt: '2026-08-04T02:00:00.000Z',
      expiresAt: '2026-08-05T02:00:00.000Z',
    }), /execution manifest.*required|projection.*manifest/i);

    const sibling = createProjectionAuthorizationFixture({
      decisionIdentity: 'canonical-item-image-projection-proposal-read-20990101-12',
    });
    try {
      const mixed = {
        ...fixture.manifest,
        inputPaths: [sibling.paths.inputPath],
        command: fixture.manifest.command.map((argument) => (
          argument.startsWith('--input-contract=')
            ? `--input-contract=${sibling.paths.inputPath}`
            : argument
        )),
      };
      assert.throws(
        () => resolveCanonicalOperationTechnicalInput({
          repoRoot: fixture.repoRoot,
          operationId: 'canonical-item-image-projection-apply',
          executionManifest: mixed,
        }),
        /manifest contract.*drift|attempt|input/i,
      );
    } finally {
      sibling.cleanup();
    }
  } finally {
    fixture.cleanup();
  }
});

test('item image projection retry uses a distinct decision-derived artifact and hash namespace', () => {
  const first = createProjectionAuthorizationFixture();
  const second = createProjectionAuthorizationFixture({
    decisionIdentity: 'canonical-item-image-projection-proposal-read-20990101-13',
  });
  try {
    const firstRequest = buildProjectionAuthorizationRequest(first);
    const secondRequest = buildProjectionAuthorizationRequest(second);
    assert.notEqual(first.paths.attemptId, second.paths.attemptId);
    assert.notEqual(first.paths.attemptRoot, second.paths.attemptRoot);
    for (const key of [
      'inputPath', 'manifestPath', 'requestPath', 'packetPath', 'permitPath', 'resultPath',
    ]) {
      assert.notEqual(first.paths[key], second.paths[key], key);
    }
    assert.notEqual(firstRequest.dataBundleSha256, secondRequest.dataBundleSha256);
    assert.notEqual(firstRequest.executionManifestHash, secondRequest.executionManifestHash);
    assert.notEqual(firstRequest.requestHash, secondRequest.requestHash);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('item image projection request and packet CLI outputs are exact, private, and no-overwrite', () => {
  const fixture = createProjectionAuthorizationFixture({ writeManifest: true });
  try {
    const requestOutput = runProjectionAuthorizationCli(fixture, {
      mode: 'request',
      output: fixture.paths.requestPath,
    });
    assert.equal(requestOutput.authorizationStatus, 'AWAITING_OWNER');
    assert.equal(fs.statSync(path.join(fixture.repoRoot, fixture.paths.requestPath)).mode & 0o777, 0o600);
    assert.throws(() => runProjectionAuthorizationCli(fixture, {
      mode: 'request',
      output: fixture.paths.requestPath,
    }), /Command failed/);

    writeProjectionOwnerInput(fixture);
    const packetOutput = runProjectionAuthorizationCli(fixture, {
      mode: 'authorize',
      output: fixture.paths.packetPath,
    });
    assert.equal(packetOutput.authorizationStatus, 'AUTHORIZED');
    assert.equal(fs.statSync(path.join(fixture.repoRoot, fixture.paths.packetPath)).mode & 0o777, 0o600);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection request CLI rejects a retained failed attempt before creating a replacement', () => {
  const fixture = createProjectionAuthorizationFixture({ writeManifest: true });
  try {
    fixture.write(fixture.paths.resultPath, {
      operationId: 'canonical-item-image-projection-apply',
      status: 'failed',
      apply: true,
    });
    assert.throws(() => runProjectionAuthorizationCli(fixture, {
      mode: 'request',
      output: fixture.paths.requestPath,
    }), /Command failed/);
    assert.equal(fs.existsSync(path.join(fixture.repoRoot, fixture.paths.requestPath)), false);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection authorization CLI rejects cross-root outputs before creating files', () => {
  for (const mode of ['request', 'authorize']) {
    const fixture = createProjectionAuthorizationFixture({ writeManifest: true });
    try {
      if (mode === 'authorize') {
        runProjectionAuthorizationCli(fixture, { mode: 'request', output: fixture.paths.requestPath });
        writeProjectionOwnerInput(fixture);
      }
      const siblingPaths = buildItemImageProjectionAttemptPaths(
        'canonical-item-image-projection-proposal-read-20990101-sibling',
      );
      for (const output of [
        `reports/authorization/canonical/${mode}.json`,
        `${fixture.paths.attemptRoot}/nested/${mode}.json`,
        mode === 'request' ? siblingPaths.requestPath : siblingPaths.packetPath,
        path.join(fixture.repoRoot, mode === 'request' ? fixture.paths.requestPath : fixture.paths.packetPath),
      ]) {
        assert.throws(
          () => runProjectionAuthorizationCli(fixture, { mode, output }),
          /Command failed/,
        );
        const candidate = path.isAbsolute(output) ? output : path.join(fixture.repoRoot, output);
        assert.equal(fs.existsSync(candidate), false, `${mode}:${output}`);
      }
    } finally {
      fixture.cleanup();
    }
  }
});

test('item image projection authorization CLI verifies the manifest before output handling', () => {
  const fixture = createProjectionAuthorizationFixture({ writeManifest: true });
  try {
    const manifestPath = path.join(fixture.repoRoot, fixture.paths.manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.codeBundleEntries[0].contentHash = `sha256:${'0'.repeat(64)}`;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const invalidOutput = 'reports/authorization/canonical/legacy-fixed-request.json';
    assert.throws(
      () => runProjectionAuthorizationCli(fixture, { mode: 'request', output: invalidOutput }),
      (error) => /code bundle.*hash mismatch/i.test(String(error.stderr)),
    );
    assert.equal(fs.existsSync(path.join(fixture.repoRoot, invalidOutput)), false);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection authorization CLI rejects a symbolic-link attempt parent', () => {
  const fixture = createProjectionAuthorizationFixture({ writeManifest: true });
  try {
    const attemptRoot = path.join(fixture.repoRoot, fixture.paths.attemptRoot);
    const retainedRoot = `${attemptRoot}.retained`;
    fs.renameSync(attemptRoot, retainedRoot);
    fs.symlinkSync(path.basename(retainedRoot), attemptRoot);
    assert.throws(
      () => runProjectionAuthorizationCli(fixture, {
        mode: 'request',
        output: fixture.paths.requestPath,
      }),
      (error) => /symbolic-link ancestor/i.test(String(error.stderr)),
    );
    assert.equal(fs.existsSync(path.join(retainedRoot, 'request.json')), false);
  } finally {
    fixture.cleanup();
  }
});

function createProjectionAuthorizationFixture({
  decisionIdentity = 'canonical-item-image-projection-proposal-read-20990101-11',
  writeManifest = false,
} = {}) {
  const sourceRoot = path.resolve(import.meta.dirname, '../../..');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-projection-authorization-'));
  fs.cpSync(path.join(sourceRoot, 'scripts'), path.join(fixtureRoot, 'scripts'), { recursive: true });
  const paths = buildItemImageProjectionAttemptPaths(decisionIdentity);
  const write = (relativePath, value, { mode = 0o600, json = true } = {}) => {
    const output = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    const bytes = Buffer.isBuffer(value)
      ? value
      : Buffer.from(json ? `${JSON.stringify(value, null, 2)}\n` : String(value));
    fs.writeFileSync(output, bytes, { mode });
    fs.chmodSync(output, mode);
    return bytes;
  };
  const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const serverFingerprint = {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'projection-authorization-server',
    databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
  };
  const target = {
    host: serverFingerprint.host,
    port: serverFingerprint.port,
    serverUuid: serverFingerprint.serverUuid,
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
    ownedColumn: 'image',
  };
  const ownerBase = {
    schemaVersion: 1,
    authorizationKind: 'canonical_read_only_proposal_authorization',
    operationId: 'canonical-item-image-projection-apply',
    action: 'read-only-proposal',
    actor: 'admin',
    reason: 'Build the exact no-write projection proposal.',
    authorizationReference: 'decision://projection/read-only/2099-01-01',
    decisionIdentity,
    authorizedAt: '2026-08-04T00:30:00.000Z',
    expiresAt: '2026-08-05T00:30:00.000Z',
    targetDatabases: serverFingerprint.databases,
    noWrite: true,
  };
  const owner = { ...ownerBase, authorizationHash: canonicalItemImageProjectionHash(ownerBase) };
  const ownerBytes = write(paths.proposalReadOwnerInputPath, owner);

  const lineageInputPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json';
  const lineageResultPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json';
  const lineageBundlePath = 'reports/audit/item-image-lineage.bundle.json';
  const lineageSnapshotPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json';
  const historicalPacketPath = 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json';
  const lineageInputBytes = write(lineageInputPath, { operationId: 'canonical-item-image-lineage-apply' });
  const lineageResultBytes = write(lineageResultPath, {
    operationId: 'canonical-item-image-lineage-apply', status: 'COMPLETED',
  });
  const lineageBundleBytes = write(lineageBundlePath, { entity: 'item_image_lineage_bundle' }, { mode: 0o644 });
  const lineageSnapshotBytes = write(lineageSnapshotPath, {
    operationId: 'canonical-item-image-lineage-apply', rowCount: 1,
  });
  const historicalDecisionIdentity = 'canonical-item-image-lineage-apply-20260801-02';
  const historicalPacketPayload = {
    schemaVersion: 1,
    authorizationStatus: 'AUTHORIZED',
    operationId: 'canonical-item-image-lineage-apply',
    actor: 'admin',
    decisionIdentity: historicalDecisionIdentity,
  };
  const historicalPacket = {
    ...historicalPacketPayload,
    packetHash: recomputeItemImageProjectionPacketHash(historicalPacketPayload),
  };
  const historicalPacketBytes = write(historicalPacketPath, historicalPacket);
  const managedPolicyPath = 'scripts/data/relation/managed-image-url-policy.mjs';
  const managedPolicyBytes = fs.readFileSync(path.join(fixtureRoot, managedPolicyPath));
  const managedUrlPrefixes = ['http://127.0.0.1:9000/terrapedia-images/items/'];
  const managedUrlPolicy = {
    sourcePath: managedPolicyPath,
    sourceSha256: sha(managedPolicyBytes),
    resolvedPrefixesSha256: canonicalItemImageProjectionHash(managedUrlPrefixes),
  };
  const snapshot = buildItemImageProjectionSnapshot({
    generatedAt: '2020-01-01T01:00:00.000Z',
    target,
    managedUrlPolicy,
    managedUrlPrefixes,
    lineageKeys: ['Wood'],
    relationRows: [{
      recordKey: 'relation-wood', internalName: 'Wood',
      cachedUrl: '/terrapedia-images/items/wood.png', role: 'icon', isPrimary: 1,
      status: 1, deleted: 0,
    }],
    projectionRows: [{
      id: 1, relationRecordKey: 'relation-wood', internalName: 'Wood',
      image: '/legacy/wood.png', status: 1, deleted: 0,
    }],
  });
  assertItemImageProjectionSnapshot(snapshot);
  const snapshotBytes = write(paths.snapshotPath, snapshot);
  const dispatchPermitHash = sha(Buffer.from('historical-dispatch-permit'));
  const proposal = buildItemImageProjectionProposal({
    generatedAt: snapshot.generatedAt,
    expiresAt: '2099-01-02T00:00:00.000Z',
    proposalAuthorization: {
      path: paths.proposalReadOwnerInputPath,
      sha256: sha(ownerBytes),
      decisionIdentity,
      authorizationHash: owner.authorizationHash,
    },
    lineage: {
      inputContractPath: lineageInputPath,
      inputContractSha256: sha(lineageInputBytes),
      resultPath: lineageResultPath,
      resultSha256: sha(lineageResultBytes),
      bundlePath: lineageBundlePath,
      bundleSha256: sha(lineageBundleBytes),
      applySnapshotPath: lineageSnapshotPath,
      applySnapshotSha256: sha(lineageSnapshotBytes),
      authorizationPacketPath: historicalPacketPath,
      authorizationPacketSha256: sha(historicalPacketBytes),
      decisionIdentity: historicalDecisionIdentity,
      packetHash: historicalPacket.packetHash,
      dispatchPermitHash,
      completedRowCount: 1,
    },
    lineageKeys: ['Wood'],
    target,
    snapshotPath: paths.snapshotPath,
    snapshotSha256: sha(snapshotBytes),
    managedUrlPolicy,
    managedUrlPrefixes,
    relationRows: [{
      recordKey: 'relation-wood', internalName: 'Wood',
      cachedUrl: '/terrapedia-images/items/wood.png', role: 'icon', isPrimary: 1,
      status: 1, deleted: 0,
    }],
    projectionRows: [{
      id: 1, relationRecordKey: 'relation-wood', internalName: 'Wood',
      image: '/legacy/wood.png', status: 1, deleted: 0,
    }],
  });
  const proposalBytes = write(paths.proposalPath, proposal);
  const input = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: sha(proposalBytes),
  });
  write(paths.inputPath, input);
  const manifestOptions = {
    repoRoot: fixtureRoot,
    operationId: 'canonical-item-image-projection-apply',
    artifactDate: '2026-08-04',
    itemImageProjectionAttemptRoot: paths.attemptRoot,
  };
  const manifest = writeManifest
    ? writeCanonicalOperationExecutionManifest({
      ...manifestOptions,
      outputPath: path.join(fixtureRoot, paths.manifestPath),
    })
    : buildCanonicalOperationExecutionManifest(manifestOptions);
  const policyRows = [{ domainId: 'items', policyVersion: 1, policyHash: HASH }];
  const dataPaths = [
    paths.inputPath,
    paths.proposalPath,
    paths.snapshotPath,
    paths.proposalReadOwnerInputPath,
    lineageInputPath,
    lineageResultPath,
    lineageBundlePath,
    lineageSnapshotPath,
    historicalPacketPath,
    managedPolicyPath,
  ];
  return {
    repoRoot: fixtureRoot,
    paths,
    input,
    manifest,
    manifestOptions,
    serverFingerprint,
    policyRows,
    dataPaths,
    historicalPacketPath,
    write,
    cleanup: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
  };
}

function buildProjectionAuthorizationRequest(fixture) {
  return buildCanonicalAuthorizationRequestForOperation({
    repoRoot: fixture.repoRoot,
    operationId: 'canonical-item-image-projection-apply',
    serverFingerprint: fixture.serverFingerprint,
    policyRows: fixture.policyRows,
    executionManifest: fixture.manifest,
    generatedAt: '2026-08-04T02:00:00.000Z',
    expiresAt: '2026-08-05T02:00:00.000Z',
  });
}

function writeProjectionOwnerInput(fixture) {
  fixture.write('owner-input.json', {
    actor: 'admin',
    reason: 'Apply the exact item image projection.',
    authorizationReference: 'decision://projection/apply/2099-01-01',
    decisionIdentity: 'canonical-item-image-projection-apply-20990101-01',
    authorizedAt: '2026-08-04T03:00:00.000Z',
  });
  fixture.write('used-decisions.json', []);
}

function runProjectionAuthorizationCli(fixture, { mode, output }) {
  const sourceRoot = path.resolve(import.meta.dirname, '../../..');
  const script = path.join(sourceRoot, 'scripts/data/automation/build-canonical-cutover-authorization.mjs');
  const args = [
    script,
    `--mode=${mode}`,
    `--repo-root=${fixture.repoRoot}`,
    '--operation-id=canonical-item-image-projection-apply',
    `--server-fingerprint=${path.join(fixture.repoRoot, 'server-fingerprint.json')}`,
    `--policy-rows=${path.join(fixture.repoRoot, 'policy-rows.json')}`,
    `--execution-manifest=${fixture.paths.manifestPath}`,
    `--output=${output}`,
  ];
  fixture.write('server-fingerprint.json', fixture.serverFingerprint);
  fixture.write('policy-rows.json', fixture.policyRows);
  if (mode === 'request') {
    args.push('--generated-at=2026-08-04T02:00:00.000Z', '--expires-at=2026-08-05T02:00:00.000Z');
  } else {
    const request = JSON.parse(fs.readFileSync(path.join(fixture.repoRoot, fixture.paths.requestPath), 'utf8'));
    args.push(
      `--request=${fixture.paths.requestPath}`,
      `--request-hash=${request.requestHash}`,
      '--owner-input=owner-input.json',
      '--used-decisions=used-decisions.json',
    );
  }
  const stdout = execFileSync(process.execPath, args, {
    cwd: fixture.repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

function writeShimmerImportContract(repoRoot) {
  const generationRoot = path.join(repoRoot, 'data/generated/shimmer/generations');
  const pointerPath = path.join(repoRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json');
  const publication = publishShimmerGeneration({
    rawBytes: Buffer.from(JSON.stringify({ pageTitle: 'Shimmer', html: '<table></table>' })),
    shards: {
      context: { entity: 'wiki_shimmer_context_importable', records: [{ code: 'SHIMMER' }] },
      itemTransforms: { entity: 'wiki_shimmer_item_transforms_importable', records: [] },
      decraftRules: { entity: 'wiki_shimmer_decraft_rules_importable', records: [] },
      entityTransforms: { entity: 'wiki_shimmer_entity_transforms_importable', records: [] },
      npcTransforms: { entity: 'wiki_shimmer_npc_transforms_importable', records: [] },
      titleResolution: { entity: 'wiki_shimmer_title_resolution', records: [] },
    },
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: `sha256:${'a'.repeat(64)}` },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: `sha256:${'b'.repeat(64)}` },
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [] })),
    producerCodeSha256: `sha256:${'c'.repeat(64)}`,
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-08-03T00:00:00.000Z',
    generationRoot,
    pointerPath,
    runId: 'authorization-test',
  });
  const contractPath = path.join(
    repoRoot,
    'reports/authorization/canonical/canonical-shimmer-import.input.json',
  );
  const generationId = publication.manifest.generationId;
  fs.mkdirSync(path.dirname(contractPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(contractPath, `${JSON.stringify({
    schemaVersion: 1,
    operationId: 'canonical-shimmer-import',
    generationId,
    manifestPath: `data/generated/shimmer/generations/${generationId}/wiki-shimmer-manifest.json`,
    manifestSha256: publication.manifest.manifestSha256,
    dataBundleSha256: publication.manifest.dataBundleSha256,
    previewSha256: `sha256:${'d'.repeat(64)}`,
    targetFingerprintSha256: `sha256:${'e'.repeat(64)}`,
    providerScope: {
      provider: 'wiki_zh',
      sourcePage: '微光',
      tables: [
        'shimmer_item_transforms',
        'shimmer_decraft_rules',
        'shimmer_entity_transforms',
        'shimmer_npc_transforms',
      ],
    },
  }, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(contractPath, 0o600);
  return publication;
}
