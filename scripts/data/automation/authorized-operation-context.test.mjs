import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
} from './build-canonical-cutover-authorization.mjs';
import {
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
