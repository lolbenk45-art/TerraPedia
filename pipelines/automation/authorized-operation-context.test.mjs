import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
  hashOrderedBundleBytes,
} from './build-canonical-cutover-authorization.mjs';
import {
  assertAuthorizedOperationDataBundle,
  assertItemImageProjectionAuthorizationEnvironment,
  consumeAuthorizedOperationDispatchPermit,
  createAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from './authorized-operation-context.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function packet() {
  const technical = {
    operationId: 'automation-biomes-l1-policy-promotion',
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    serverFingerprint: {
      host: '127.0.0.1', port: 3306, serverUuid: 'server',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    schemaEntries: [],
    dataEntries: [],
    policyRows: [{ domainId: 'biomes', policyVersion: 1, policyHash: HASH }],
    executionManifest: { schemaVersion: 1, operationId: 'automation-biomes-l1-policy-promotion', command: ['node', 'script.mjs'] },
    requiredTechnicalFields: ['serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'policySetHash', 'executionManifestHash'],
  };
  const request = buildCanonicalAuthorizationRequest({
    ...technical,
    generatedAt: '2026-07-28T03:00:00.000Z',
    expiresAt: '2026-07-28T04:00:00.000Z',
  });
  return authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'system-owner',
    reason: 'promote biomes to L1',
    authorizationReference: 'decision://l1-promotion',
    decisionIdentity: 'decision-l1-promotion',
    authorizedAt: '2026-07-28T03:01:00.000Z',
    currentTechnicalInput: technical,
  });
}

test('authorized child context revalidates a private exact-operation packet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-context-'));
  const file = path.join(dir, 'packet.json');
  fs.writeFileSync(file, `${JSON.stringify(packet())}\n`, { mode: 0o600 });
  const context = loadAuthorizedOperationContext({
    env: { TERRAPEDIA_AUTHORIZED_PACKET_PATH: file },
    operationId: 'automation-biomes-l1-policy-promotion',
    now: '2026-07-28T03:02:00.000Z',
  });
  assert.equal(context.actor, 'system-owner');
  assert.equal(context.packetHash, packet().packetHash);
  assert.equal(context.decisionIdentity, 'decision-l1-promotion');
});

test('authorized child context rejects wrong operations and readable packet files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-context-'));
  const file = path.join(dir, 'packet.json');
  fs.writeFileSync(file, `${JSON.stringify(packet())}\n`, { mode: 0o644 });
  assert.throws(() => loadAuthorizedOperationContext({
    env: { TERRAPEDIA_AUTHORIZED_PACKET_PATH: file },
    operationId: 'automation-biomes-l1-policy-promotion',
    now: '2026-07-28T03:02:00.000Z',
  }), /private/i);
  fs.chmodSync(file, 0o600);
  assert.throws(() => loadAuthorizedOperationContext({
    env: { TERRAPEDIA_AUTHORIZED_PACKET_PATH: file },
    operationId: 'automation-biomes-l2-promotion',
    now: '2026-07-28T03:02:00.000Z',
  }), /operationId/i);
  assert.throws(() => loadAuthorizedOperationContext({
    env: { TERRAPEDIA_AUTHORIZED_PACKET_PATH: file },
    operationId: 'automation-biomes-l1-policy-promotion',
    now: '2026-07-28T04:00:00.000Z',
  }), /expired|currently valid/i);
});

test('private dispatch permit binds and atomically consumes the authorized packet context', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-context-'));
  const authorized = packet();
  const permit = createAuthorizedOperationDispatchPermit({ directory: dir, packet: authorized });
  const ledgerPath = path.join(dir, 'used-decisions.json');
  fs.writeFileSync(ledgerPath, `${JSON.stringify([{
    decisionIdentity: authorized.decisionIdentity,
    dispatchPermitHash: permit.dispatchPermitHash,
  }])}\n`, { mode: 0o600 });
  assert.equal(fs.statSync(permit.path).mode & 0o777, 0o600);
  assert.equal(consumeAuthorizedOperationDispatchPermit({
    env: {
      TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path,
      TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce,
    },
    authorizedContext: {
      operationId: authorized.operationId,
      decisionIdentity: authorized.decisionIdentity,
      packetHash: authorized.packetHash,
    },
    decisionLedgerPath: ledgerPath,
  }), true);
  assert.equal(fs.existsSync(permit.path), false);
  assert.throws(() => consumeAuthorizedOperationDispatchPermit({
    env: {
      TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path,
      TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce,
    },
    authorizedContext: {
      operationId: authorized.operationId,
      decisionIdentity: authorized.decisionIdentity,
      packetHash: authorized.packetHash,
    },
    decisionLedgerPath: ledgerPath,
  }), /unavailable|already consumed/i);
});

test('projection dispatch permit uses one exact private no-overwrite output path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-context-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-context-outside-'));
  const outputPath = path.join(dir, 'permit.json');
  const authorized = packet();
  try {
    const permit = createAuthorizedOperationDispatchPermit({
      directory: dir,
      outputPath,
      packet: authorized,
    });
    assert.equal(permit.path, outputPath);
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.throws(
      () => createAuthorizedOperationDispatchPermit({
        directory: dir,
        outputPath,
        packet: authorized,
      }),
      /already exists|overwrite/i,
    );
    assert.throws(() => createAuthorizedOperationDispatchPermit({
      directory: dir,
      outputPath: path.join(outside, 'escaped-permit.json'),
      packet: authorized,
    }), /confinement|inside|outside/i);
    fs.symlinkSync(outside, path.join(dir, 'linked-attempt'));
    assert.throws(() => createAuthorizedOperationDispatchPermit({
      directory: dir,
      outputPath: path.join(dir, 'linked-attempt', 'permit.json'),
      packet: authorized,
    }), /symbolic|confinement|inside/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('authorized data bundle validator recomputes the current manifest-derived bytes', () => {
  const dataEntries = [{ path: 'attempt/input.json', bytes: Buffer.from('{"ok":true}\n') }];
  const dataBundleSha256 = hashOrderedBundleBytes(dataEntries, 'data bundle');
  const authorizedContext = {
    operationId: 'canonical-item-image-projection-apply',
    dataBundleSha256,
    executionManifest: { operationId: 'canonical-item-image-projection-apply' },
  };
  assert.equal(assertAuthorizedOperationDataBundle({
    repoRoot: '/tmp/repo',
    authorizedContext,
    resolveTechnicalInput: () => ({ dataEntries }),
  }), true);
  assert.throws(() => assertAuthorizedOperationDataBundle({
    repoRoot: '/tmp/repo',
    authorizedContext,
    resolveTechnicalInput: () => ({ dataEntries: [{ ...dataEntries[0], bytes: Buffer.from('{}\n') }] }),
  }), /data bundle.*drift/i);
});

test('projection child authorization environment requires exact same-attempt packet and permit paths', () => {
  const repoRoot = path.resolve('/tmp/projection-child-root');
  const attemptRoot = `reports/authorization/canonical/item-image-projection-apply/${'5'.repeat(64)}`;
  const exactEnv = {
    TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.join(repoRoot, attemptRoot, 'packet.json'),
    TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: path.join(repoRoot, attemptRoot, 'permit.json'),
  };
  assert.equal(assertItemImageProjectionAuthorizationEnvironment({
    repoRoot,
    attemptRoot,
    env: exactEnv,
  }), true);
  for (const env of [
    { ...exactEnv, TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.join(repoRoot, 'packet.json') },
    { ...exactEnv, TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: path.join(repoRoot, 'permit.json') },
  ]) {
    assert.throws(() => assertItemImageProjectionAuthorizationEnvironment({
      repoRoot,
      attemptRoot,
      env,
    }), /same-attempt|exact.*attempt/i);
  }
});

test('NPC owner executor rejects direct CLI use before it can read an input or connect', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-context-'));
  const file = path.join(dir, 'packet.json');
  const now = Date.now();
  const generatedAt = new Date(now - 60_000).toISOString();
  const expiresAt = new Date(now + 60_000).toISOString();
  const operationId = 'canonical-npc-boss-loot-projection-apply';
  const technical = {
    operationId,
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    serverFingerprint: {
      host: '127.0.0.1', port: 3306, serverUuid: 'server',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    schemaEntries: [],
    dataEntries: [],
    policyRows: [{ domainId: 'biomes', policyVersion: 1, policyHash: HASH }],
    executionManifest: { schemaVersion: 1, operationId, command: ['node', 'script.mjs'] },
    requiredTechnicalFields: ['serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'policySetHash', 'executionManifestHash'],
  };
  const request = buildCanonicalAuthorizationRequest({ ...technical, generatedAt, expiresAt });
  const authorized = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'system-owner',
    reason: 'test direct executor rejection',
    authorizationReference: 'decision://direct-executor-test',
    decisionIdentity: 'direct-executor-test',
    authorizedAt: new Date(now - 30_000).toISOString(),
    currentTechnicalInput: technical,
  });
  fs.writeFileSync(file, `${JSON.stringify(authorized)}\n`, { mode: 0o600 });
  const executor = path.resolve(import.meta.dirname, '../npc-canonical/npc-owner-phase-apply.mjs');
  const result = spawnSync(process.execPath, [
    executor,
    `--operation-id=${operationId}`,
    '--apply=true',
    '--input=does-not-exist.json',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TERRAPEDIA_AUTHORIZED_PACKET_PATH: file },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authorized dispatch permit.*required/i);

  const permitPath = path.join(dir, 'forged-permit.json');
  const nonce = 'forged-dispatch-nonce';
  fs.writeFileSync(permitPath, `${JSON.stringify({
    schemaVersion: 1,
    operationId,
    decisionIdentity: authorized.decisionIdentity,
    packetHash: authorized.packetHash,
    nonce,
  })}\n`, { mode: 0o600 });
  const forged = spawnSync(process.execPath, [
    executor,
    `--operation-id=${operationId}`,
    '--apply=true',
    '--input=does-not-exist.json',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TERRAPEDIA_AUTHORIZED_PACKET_PATH: file,
      TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permitPath,
      TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: nonce,
    },
  });
  assert.notEqual(forged.status, 0);
  assert.match(forged.stderr, /dispatch permit.*durable decision ledger/i);
});

test('NPC base maint executor rejects direct CLI use before reading source files or connecting', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorized-base-maint-context-'));
  const packetPath = path.join(dir, 'packet.json');
  const now = Date.now();
  const operationId = 'canonical-npc-base-maint-nontown-apply';
  const technical = {
    operationId,
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    serverFingerprint: {
      host: '127.0.0.1', port: 3306, serverUuid: 'server',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    schemaEntries: [],
    dataEntries: [],
    policyRows: [{ domainId: 'biomes', policyVersion: 1, policyHash: HASH }],
    executionManifest: { schemaVersion: 1, operationId, command: ['node', 'script.mjs'] },
    requiredTechnicalFields: ['serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'policySetHash', 'executionManifestHash'],
  };
  const request = buildCanonicalAuthorizationRequest({
    ...technical,
    generatedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  });
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'system-owner',
    reason: 'test base maint direct executor rejection',
    authorizationReference: 'decision://base-maint-direct-executor-test',
    decisionIdentity: 'base-maint-direct-executor-test',
    authorizedAt: new Date(now - 30_000).toISOString(),
    currentTechnicalInput: technical,
  });
  fs.writeFileSync(packetPath, `${JSON.stringify(packet)}\n`, { mode: 0o600 });

  const result = spawnSync(process.execPath, [
    path.resolve(import.meta.dirname, '../npc-canonical/npc-base-maint-apply.mjs'),
    `--operation-id=${operationId}`,
    '--apply=true',
    '--input=does-not-exist.json',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TERRAPEDIA_AUTHORIZED_PACKET_PATH: packetPath },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authorized dispatch permit.*required/i);
});
