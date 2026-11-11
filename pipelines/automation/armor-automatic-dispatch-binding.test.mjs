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
  writeArmorAutomaticBinding,
} from './armor-automatic-dispatch-binding.mjs';
import {
  ARMOR_CANONICAL_POLICY_OWNER_SCOPES,
  buildArmorCanonicalFenceCommit,
} from '../relation/armor-canonical-write-fence.mjs';
import { runArmorAutomaticOperation } from './run-armor-automatic-operation.mjs';

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
    schemaVersion: 'armor-canonical-full-chain-intent/v2',
    operationId: 'canonical-armor-ingestion',
    executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    localProjection: {
      schemaVersion: 'armor-canonical-local-projection/v1',
      candidateSha256: `sha256:${'9'.repeat(64)}`,
    },
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
  const relativePath = buildArmorAutomaticBindingPath({
    sourceFingerprint,
    sourceRunIdentity: '2026-10-08T11:58:00.000Z',
    sourceContentIdentity,
  });
  const bindingPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(bindingPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(bindingPath, JSON.stringify(binding) + '\n', { mode: 0o600 });
  fs.chmodSync(bindingPath, 0o600);
  const result = { repoRoot, relativePath, bindingPath, binding, intentPath };
  installLocalProjectionAuthorization(result, {
    packetExpiresAt: '2026-10-08T12:30:00.000Z',
    fenceExpiresAt: '2026-10-08T12:30:00.000Z',
  });
  return result;
}

function installLocalProjectionAuthorization(f, { packetExpiresAt, fenceExpiresAt }) {
  const intentFilePath = path.join(f.repoRoot, f.intentPath);
  const intentBytes = Buffer.from(`${JSON.stringify({
    ...JSON.parse(fs.readFileSync(intentFilePath, 'utf8')),
    localProjection: {
      schemaVersion: 'armor-canonical-local-projection/v1',
      candidateSha256: `sha256:${'9'.repeat(64)}`,
    },
  })}\n`);
  fs.writeFileSync(intentFilePath, intentBytes, { mode: 0o600 });
  f.binding.intent.sha256 = sha256(intentBytes);

  let tokenIndex = 0;
  let markerIndex = 0;
  const fenceCommit = buildArmorCanonicalFenceCommit({
    runId: 'armor-run-automatic-29',
    expiresAt: fenceExpiresAt,
    generations: ARMOR_CANONICAL_POLICY_OWNER_SCOPES.map((scope, index) => ({
      ...scope,
      generation: index,
      schemaHash: `sha256:${'f'.repeat(64)}`,
    })),
    tokenFactory: () => `fence:${String(++tokenIndex).padStart(64, '0')}`,
    markerFactory: () => String(++markerIndex).padStart(64, '0'),
  });
  const packet = {
    operationId: f.binding.operationId,
    decisionIdentity: f.binding.authorization.decisionIdentity,
    policySetHash,
    authorizedAt: '2026-10-08T11:59:00.000Z',
    expiresAt: packetExpiresAt,
    executionManifest: {
      resultLabel: f.binding.resultLabel,
      armorCanonicalIntent: {
        intentPath: f.binding.intent.path,
        intentFileSha256: f.binding.intent.sha256,
        fullChainSha256,
        runId: fenceCommit.runId,
        fenceCommit,
      },
    },
  };
  const packetBytes = Buffer.from(`${JSON.stringify(packet)}\n`);
  fs.writeFileSync(path.join(f.repoRoot, f.binding.authorization.packetPath), packetBytes, { mode: 0o600 });
  f.binding.authorization.packetSha256 = sha256(packetBytes);
  fs.writeFileSync(f.bindingPath, `${JSON.stringify(f.binding)}\n`, { mode: 0o600 });
  fs.chmodSync(f.bindingPath, 0o600);
}

function replaceIntentAndRefreshPacketBinding(f, intent) {
  const intentBytes = Buffer.from(`${JSON.stringify(intent)}\n`);
  fs.writeFileSync(path.join(f.repoRoot, f.intentPath), intentBytes, { mode: 0o600 });
  f.binding.intent.sha256 = sha256(intentBytes);
  const packetPath = path.join(f.repoRoot, f.binding.authorization.packetPath);
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  packet.executionManifest.armorCanonicalIntent.intentFileSha256 = f.binding.intent.sha256;
  const packetBytes = Buffer.from(`${JSON.stringify(packet)}\n`);
  fs.writeFileSync(packetPath, packetBytes, { mode: 0o600 });
  f.binding.authorization.packetSha256 = sha256(packetBytes);
  fs.writeFileSync(f.bindingPath, `${JSON.stringify(f.binding)}\n`, { mode: 0o600 });
  fs.chmodSync(f.bindingPath, 0o600);
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

test('writes an exact validated Armor automatic binding once with private atomic output', (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.bindingPath);
  const result = writeArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    binding: f.binding,
    now,
  });

  assert.equal(result.path, f.relativePath);
  assert.equal(result.sha256, sha256(fs.readFileSync(f.bindingPath)));
  assert.equal(fs.statSync(f.bindingPath).mode & 0o777, 0o600);
  assert.deepEqual(readArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    relativePath: f.relativePath,
    now,
    expectedAttemptId: f.binding.attemptId,
    expectedSourceDispatchIdentity: f.binding.sourceDispatchIdentity,
  }), f.binding);
  assert.throws(() => writeArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    binding: f.binding,
    now,
  }), /already exists|overwrite|refus/i);
});

test('does not publish an Armor automatic binding when one of its bound artifacts is missing', (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.bindingPath);
  fs.unlinkSync(path.join(f.repoRoot, f.binding.authorization.packetPath));

  assert.throws(() => writeArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    binding: f.binding,
    now,
  }), /ordinary|missing|not found|ENOENT/i);
  assert.equal(fs.existsSync(f.bindingPath), false);
});

test('path builder requires a lowercase sha256 source fingerprint', () => {
  assert.throws(() => buildArmorAutomaticBindingPath({
    sourceFingerprint: 'sha256:ABC', sourceRunIdentity: '2026-10-08T11:58:00.000Z', sourceContentIdentity,
  }), /lowercase|sha256|fingerprint|identity/i);
  assert.throws(() => buildArmorAutomaticBindingPath({
    sourceFingerprint: 'sha1:' + 'a'.repeat(64), sourceRunIdentity: '2026-10-08T11:58:00.000Z', sourceContentIdentity,
  }), /sha256|fingerprint|identity/i);
  assert.throws(() => buildArmorAutomaticBindingPath({
    sourceFingerprint, sourceRunIdentity: 'invalid-time', sourceContentIdentity,
  }), /run identity|timestamp|ISO/i);
});

test('source dispatch identity gets a distinct immutable binding path for each probe run', () => {
  const first = buildArmorAutomaticBindingPath({
    sourceFingerprint, sourceRunIdentity: '2026-10-08T11:58:00.000Z', sourceContentIdentity,
  });
  const second = buildArmorAutomaticBindingPath({
    sourceFingerprint, sourceRunIdentity: '2026-10-08T12:58:00.000Z', sourceContentIdentity,
  });
  assert.notEqual(first, second);
  assert.match(first, /^reports\/authorization\/canonical\/automatic-armor\/[a-f0-9]{64}\/[a-f0-9]{64}\.binding\.json$/);
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

test('rejects a local-projection intent whose authorized packet omits the complete fence binding', (t) => {
  const f = fixture(t);
  const intentBytes = Buffer.from(JSON.stringify({
    ...JSON.parse(fs.readFileSync(path.join(f.repoRoot, f.intentPath), 'utf8')),
    localProjection: {
      schemaVersion: 'armor-canonical-local-projection/v1',
      candidateSha256: `sha256:${'9'.repeat(64)}`,
    },
  }) + '\n');
  fs.writeFileSync(path.join(f.repoRoot, f.intentPath), intentBytes, { mode: 0o600 });
  f.binding.intent.sha256 = sha256(intentBytes);
  const packetPath = path.join(f.repoRoot, f.binding.authorization.packetPath);
  const packetBytes = Buffer.from(JSON.stringify({
    operationId: 'canonical-armor-ingestion',
    decisionIdentity: f.binding.authorization.decisionIdentity,
    policySetHash,
    executionManifest: {
      resultLabel: f.binding.resultLabel,
      armorCanonicalIntent: {
        intentPath: f.binding.intent.path,
        intentFileSha256: f.binding.intent.sha256,
        fullChainSha256,
        runId: 'armor-run-automatic-29',
        fenceCommit: { generation: 1, marker: 'legacy-single-fence' },
      },
    },
  }) + '\n');
  fs.writeFileSync(packetPath, packetBytes, { mode: 0o600 });
  f.binding.authorization.packetSha256 = sha256(packetBytes);
  fs.writeFileSync(f.bindingPath, JSON.stringify(f.binding) + '\n', { mode: 0o600 });
  fs.chmodSync(f.bindingPath, 0o600);

  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot, relativePath: f.relativePath, now, expectedAttemptId: f.binding.attemptId,
  }), /all-scope|fence commit/i);
});

test('rejects local-projection authorization when packet and fence expiries differ before dispatch', (t) => {
  const f = fixture(t);
  installLocalProjectionAuthorization(f, {
    packetExpiresAt: '2026-10-08T12:30:00.000Z',
    fenceExpiresAt: '2026-10-08T12:20:00.000Z',
  });

  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    relativePath: f.relativePath,
    now,
    expectedAttemptId: f.binding.attemptId,
    expectedSourceDispatchIdentity: f.binding.sourceDispatchIdentity,
  }), /expiry/i);
});

test('rejects local-projection authorization when the packet and fence are both expired before dispatch', (t) => {
  const f = fixture(t);
  installLocalProjectionAuthorization(f, {
    packetExpiresAt: '2026-10-08T11:59:00.000Z',
    fenceExpiresAt: '2026-10-08T11:59:00.000Z',
  });

  assert.throws(() => readArmorAutomaticBinding({
    repoRoot: f.repoRoot,
    relativePath: f.relativePath,
    now,
    expectedAttemptId: f.binding.attemptId,
    expectedSourceDispatchIdentity: f.binding.sourceDispatchIdentity,
  }), /expired|expiry/i);
});

test('does not start the Armor source child when packet and fence have expired', async (t) => {
  const f = fixture(t);
  installLocalProjectionAuthorization(f, {
    packetExpiresAt: '2026-10-08T11:59:00.000Z',
    fenceExpiresAt: '2026-10-08T11:59:00.000Z',
  });
  const env = {
    WORKTREE_ROOT: f.repoRoot,
    TERRAPEDIA_CRAWLER_ACTION_ID: f.binding.actionId,
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: f.binding.attemptId,
    TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
    TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: f.binding.sourceDispatchIdentity.sourceFingerprint,
    TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: f.binding.sourceDispatchIdentity.sourceRunIdentity,
    TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: f.binding.sourceDispatchIdentity.sourceContentIdentity,
  };
  let sourceChildren = 0;

  await assert.rejects(() => runArmorAutomaticOperation({
    argv: ['--domain=armor_sets'],
    env,
    now,
    readBindingImpl: (options) => readArmorAutomaticBinding({
      ...options,
      repoRoot: f.repoRoot,
      relativePath: f.relativePath,
      now,
    }),
    spawnNodeImpl: () => { sourceChildren += 1; },
    publishProgressImpl: () => {},
  }), /expired|expiry/i);
  assert.equal(sourceChildren, 0);
});

test('does not start the Armor source child when a v2 intent omits or nulls its local projection', async (t) => {
  for (const projection of ['missing', null]) {
    const f = fixture(t);
    const intent = JSON.parse(fs.readFileSync(path.join(f.repoRoot, f.intentPath), 'utf8'));
    if (projection === 'missing') delete intent.localProjection;
    else intent.localProjection = null;
    replaceIntentAndRefreshPacketBinding(f, intent);
    const env = {
      WORKTREE_ROOT: f.repoRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: f.binding.actionId,
      TERRAPEDIA_CRAWLER_ATTEMPT_ID: f.binding.attemptId,
      TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
      TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT: f.binding.sourceDispatchIdentity.sourceFingerprint,
      TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY: f.binding.sourceDispatchIdentity.sourceRunIdentity,
      TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY: f.binding.sourceDispatchIdentity.sourceContentIdentity,
    };
    let sourceChildren = 0;

    await assert.rejects(() => runArmorAutomaticOperation({
      argv: ['--domain=armor_sets'],
      env,
      now,
      readBindingImpl: (options) => readArmorAutomaticBinding({
        ...options,
        repoRoot: f.repoRoot,
        relativePath: f.relativePath,
        now,
      }),
      spawnNodeImpl: () => { sourceChildren += 1; },
      publishProgressImpl: () => {},
    }), /local projection/i);
    assert.equal(sourceChildren, 0);
  }
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
