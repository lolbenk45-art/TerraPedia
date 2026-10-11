import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ARMOR_AUTOMATIC_DISPATCH_BINDING_SCHEMA,
  assertArmorAutomaticBinding,
  buildArmorAutomaticBindingPath,
  readArmorAutomaticBinding,
} from './armor-automatic-dispatch-binding.mjs';

const now = '2026-10-08T12:00:00.000Z';
const sourceFingerprint = `sha256:${'a'.repeat(64)}`;
const sourceContentIdentity = `sha256:${'b'.repeat(64)}`;
const fullChainSha256 = `sha256:${'c'.repeat(64)}`;
const policySetHash = `sha256:${'d'.repeat(64)}`;

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-dispatch-binding-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const canonicalRoot = path.join(repoRoot, 'reports/authorization/canonical');
  const automaticRoot = path.join(canonicalRoot, 'automatic-armor');
  fs.mkdirSync(automaticRoot, { recursive: true, mode: 0o700 });
  const resultLabel = 'automatic-29';
  const intentPath = 'reports/authorization/canonical/canonical-armor-ingestion.automatic-29.intent.json';
  const packetPath = 'reports/authorization/canonical/attempt-123/packet.json';
  const permitPath = 'reports/authorization/canonical/attempt-123/permit.json';
  const serverFingerprintPath = 'reports/authorization/canonical/attempt-123/server-fingerprint.json';
  const intentBytes = Buffer.from(JSON.stringify({
    schemaVersion: 'armor-canonical-full-chain-intent/v1',
    operationId: 'canonical-armor-ingestion',
    executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    fullChainSha256,
  }) + '\n');
  const files = new Map([
    [intentPath, intentBytes],
    [packetPath, Buffer.from('{"packet":true}\n')],
    [permitPath, Buffer.from('{"permit":true}\n')],
    [serverFingerprintPath, Buffer.from('{"server":"test"}\n')],
  ]);
  for (const [relativePath, bytes] of files) {
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes, { mode: 0o600 });
    fs.chmodSync(target, 0o600);
  }
  const binding = {
    schemaVersion: ARMOR_AUTOMATIC_DISPATCH_BINDING_SCHEMA,
    actionId: 'domain-source-armor-sets',
    operationId: 'canonical-armor-ingestion',
    attemptId: 'attempt-123',
    sourceDispatchIdentity: {
      sourceFingerprint,
      sourceRunIdentity: '2026-10-08T11:58:00.000Z',
      sourceContentIdentity,
    },
    intent: {
      path: intentPath,
      sha256: sha256(intentBytes),
      fullChainSha256,
    },
    authorization: {
      packetPath,
      packetSha256: sha256(files.get(packetPath)),
      permitPath,
      permitHash: sha256(files.get(permitPath)),
      nonce: 'nonce-123',
      serverFingerprintPath,
      serverFingerprintSha256: sha256(files.get(serverFingerprintPath)),
      policySetHash,
      decisionIdentity: 'decision-123',
    },
    activation: {
      decisionIdentity: 'activation-123',
      packetHash: `sha256:${'e'.repeat(64)}`,
      policySetHash,
      authorizedAt: '2026-10-08T11:59:00.000Z',
      expiresAt: '2026-10-08T12:30:00.000Z',
    },
    resultLabel,
    createdAt: '2026-10-08T11:59:00.000Z',
    expiresAt: '2026-10-08T12:30:00.000Z',
    consumedAt: null,
  };
  const relativePath = buildArmorAutomaticBindingPath(sourceFingerprint);
  const bindingPath = path.join(repoRoot, relativePath);
  fs.writeFileSync(bindingPath, JSON.stringify(binding) + '\n', { mode: 0o600 });
  fs.chmodSync(bindingPath, 0o600);
  return { repoRoot, relativePath, bindingPath, binding, intentPath };
}

test('reads and validates a fresh Armor automatic binding', (t) => {
  const f = fixture(t);
  const result = readArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    relativePath: f.relativePath,
    now,
    expectedAttemptId: f.binding.attemptId,
    expectedSourceDispatchIdentity: f.binding.sourceDispatchIdentity,
  });
  assert.deepEqual(result, f.binding);
});

test('path builder requires a lowercase sha256 source fingerprint', () => {
  assert.equal(buildArmorAutomaticBindingPath(sourceFingerprint),
    `reports/authorization/canonical/automatic-armor/${'a'.repeat(64)}.binding.json`);
  assert.throws(() => buildArmorAutomaticBindingPath('sha256:ABC'), /lowercase|sha256|fingerprint/i);
  assert.throws(() => buildArmorAutomaticBindingPath('sha1:' + 'a'.repeat(64)), /sha256|fingerprint/i);
});

test('rejects the legacy Armor L1 operation identity', (t) => {
  const f = fixture(t);
  const invalid = { ...f.binding, operationId: 'automation-armor-sets-l1' };
  assert.throws(() => assertArmorAutomaticBinding({
    repoRoot: f.repoRoot, binding: invalid, bindingPath: f.bindingPath, now,
  }), /operation/i);
});

test('rejects source fingerprint drift', (t) => {
  const f = fixture(t);
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    relativePath: f.relativePath,
    now,
    expectedSourceDispatchIdentity: {
      ...f.binding.sourceDispatchIdentity,
      sourceFingerprint: `sha256:${'f'.repeat(64)}`,
    },
  }), /source.*fingerprint|source.*identity|drift/i);
});

test('rejects an intent whose full-chain hash differs', (t) => {
  const f = fixture(t);
  const intent = JSON.parse(fs.readFileSync(path.join(f.repoRoot, f.intentPath), 'utf8'));
  intent.fullChainSha256 = `sha256:${'f'.repeat(64)}`;
  fs.writeFileSync(path.join(f.repoRoot, f.intentPath), JSON.stringify(intent) + '\n', { mode: 0o600 });
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath, now,
  }), /full.chain|intent.*hash|hash.*drift/i);
});

test('rejects a readable 0644 binding', (t) => {
  const f = fixture(t);
  fs.chmodSync(f.bindingPath, 0o644);
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath, now,
  }), /private|0600/i);
});

test('rejects a symlinked binding', (t) => {
  const f = fixture(t);
  const target = `${f.bindingPath}.real`;
  fs.renameSync(f.bindingPath, target);
  fs.symlinkSync(target, f.bindingPath);
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath, now,
  }), /symbolic|ordinary|symlink/i);
});

test('rejects expired bindings', (t) => {
  const f = fixture(t);
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath,
    now: '2026-10-08T12:31:00.000Z',
  }), /expired|expiry/i);
});

test('rejects consumed bindings', (t) => {
  const f = fixture(t);
  const consumed = { ...f.binding, consumedAt: '2026-10-08T12:01:00.000Z' };
  fs.writeFileSync(f.bindingPath, JSON.stringify(consumed) + '\n', { mode: 0o600 });
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath, now,
  }), /consum|replay/i);
});

test('rejects a pre-existing result path', (t) => {
  const f = fixture(t);
  const resultPath = path.join(f.repoRoot,
    `reports/authorization/canonical/canonical-armor-ingestion.${f.binding.resultLabel}.result.json`);
  fs.writeFileSync(resultPath, '{}\n', { mode: 0o600 });
  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath, now,
  }), /result|journal|already exists|retained/i);
});
