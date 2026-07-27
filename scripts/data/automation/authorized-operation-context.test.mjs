import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
} from './build-canonical-cutover-authorization.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';

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
