import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildCanonicalOperationExecutionManifest } from './canonical-operation-execution-manifest.mjs';
import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequestForOperation,
  resolveCanonicalOperationTechnicalInput,
  verifyCanonicalAuthorizationPacketAgainstCurrent,
} from './build-canonical-cutover-authorization.mjs';

const operationId = 'canonical-buff-full-chain';
const sourceRoot = path.resolve(import.meta.dirname, '../..');
const generatedAt = '2026-09-28T12:00:00.000Z';
const policyRows = [{ domainId: 'buffs', policyVersion: 1, policyHash: `sha256:${'a'.repeat(64)}` }];
const expiresAt = '2026-09-29T12:00:00.000Z';
const serverFingerprint = {
  host: '127.0.0.1', port: 13306, serverUuid: 'test-server',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
};

function fixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-authorization-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: sourceRoot,
    operationId,
    resultLabel: 'test-01',
    buffFullChainBinding: {
      schemaVersion: 'buff-full-chain-operation-binding/v1',
      operationId,
      resultLabel: 'test-01',
      runId: 'buff-full-chain-test-01',
      fenceToken: 'fence:test-full-chain-01',
    },
  });
  for (const entry of manifest.codeBundleEntries) {
    const target = path.join(repoRoot, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, entry.path), target);
  }
  const envelopePath = path.join(repoRoot, manifest.buffFullChain.envelopePath);
  fs.mkdirSync(path.dirname(envelopePath), { recursive: true });
  fs.writeFileSync(envelopePath, '{"frozen":"original"}\n', { mode: 0o600 });
  const options = { repoRoot, operationId, executionManifest: manifest };
  const technical = () => ({ ...resolveCanonicalOperationTechnicalInput(options), serverFingerprint, policyRows });
  return { repoRoot, manifest, envelopePath, options, technical };
}

test('Buff authorization binds private envelope bytes through request and packet verification', (t) => {
  const f = fixture(t);
  const request = buildCanonicalAuthorizationRequestForOperation({
    ...f.options, serverFingerprint, policyRows, generatedAt, expiresAt,
  });
  assert.deepEqual(request.dataBundleEntries.map((entry) => entry.path), [f.manifest.buffFullChain.envelopePath]);
  assert.equal(request.dataBundleEntries[0].contentHash,
    `sha256:${createHash('sha256').update(fs.readFileSync(f.envelopePath)).digest('hex')}`);
  const packet = authorizeCanonicalCutoverRequest({
    request, requestHash: request.requestHash, actor: 'test-owner', reason: 'offline test',
    authorizationReference: 'test://buff-binding', decisionIdentity: 'test-buff-01',
    authorizedAt: generatedAt, currentTechnicalInput: f.technical(), usedDecisionIdentities: new Set(),
  });
  assert.equal(verifyCanonicalAuthorizationPacketAgainstCurrent({
    packet, currentTechnicalInput: f.technical(), now: generatedAt,
  }), true);
  fs.appendFileSync(f.envelopePath, ' ');
  assert.throws(() => verifyCanonicalAuthorizationPacketAgainstCurrent({
    packet, currentTechnicalInput: f.technical(), now: generatedAt,
  }), /data bundle drifted/);
});

test('Buff authorization requires a manifest', (t) => {
  const f = fixture(t);
  assert.throws(() => resolveCanonicalOperationTechnicalInput({ repoRoot: f.repoRoot, operationId }), /manifest is required/);
});

test('Buff additive authorization binds its private proposal as the data bundle', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-additive-authorization-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const additiveOperationId = 'canonical-buff-additive-relation-apply';
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: sourceRoot,
    operationId: additiveOperationId,
    resultLabel: 'test-01',
    buffAdditiveRelationBinding: {
      schemaVersion: 'buff-additive-relation-operation-binding/v1',
      operationId: additiveOperationId,
      resultLabel: 'test-01',
      runId: 'buff-additive-relation-test-01',
      fenceToken: 'fence:test-01',
    },
  });
  for (const entry of manifest.codeBundleEntries) {
    const target = path.join(repoRoot, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, entry.path), target);
  }
  const proposalPath = manifest.buffAdditiveRelation.proposalPath;
  const proposalTarget = path.join(repoRoot, proposalPath);
  fs.mkdirSync(path.dirname(proposalTarget), { recursive: true });
  fs.writeFileSync(proposalTarget, '{"operationId":"canonical-buff-additive-relation-apply"}\n', { mode: 0o600 });

  const resolved = resolveCanonicalOperationTechnicalInput({
    repoRoot,
    operationId: additiveOperationId,
    executionManifest: manifest,
  });

  assert.deepEqual(resolved.dataEntries.map((entry) => entry.path), [proposalPath]);
});

for (const invalid of ['public', 'missing', 'symlink']) {
  test(`Buff authorization refuses ${invalid} envelope`, (t) => {
    const f = fixture(t);
    if (invalid === 'public') fs.chmodSync(f.envelopePath, 0o644);
    else {
      fs.renameSync(f.envelopePath, `${f.envelopePath}.other`);
      if (invalid === 'symlink') fs.symlinkSync(`${f.envelopePath}.other`, f.envelopePath);
    }
    assert.throws(() => f.technical(), /private|missing|ENOENT|symbolic|symlink|ordinary/i);
  });
}
