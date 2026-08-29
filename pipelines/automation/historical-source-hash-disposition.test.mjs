import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  approveHistoricalSourceHashDisposition,
  buildHistoricalSourceHashDisposition,
  readHistoricalSourceHashDisposition,
  writeHistoricalSourceHashDisposition,
} from './historical-source-hash-disposition.mjs';
import {
  buildCanonicalAuthorizationRequest,
  hashOrderedBundleBytes,
  resolveCanonicalOperationTechnicalInput,
} from './build-canonical-cutover-authorization.mjs';
import {
  canonicalServerFingerprint,
  hashCanonicalServerFingerprint,
} from './automation-database-contract.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';

const POLICY_SET_HASH = `sha256:${'1'.repeat(64)}`;
const POLICY_HASHES = {
  items: `sha256:${'2'.repeat(64)}`,
  projectiles: `sha256:${'3'.repeat(64)}`,
  shimmer: `sha256:${'4'.repeat(64)}`,
};

test('builds an exact candidate for a legacy semantic-JSON source hash mismatch', () => {
  const sourceBytes = Buffer.from('{"domain":"items","records":[1,2]}\n', 'utf8');
  const entry = fixtureEntry({
    domainId: 'items',
    sourceBytes,
    declaredSourceHash: semanticHash(sourceBytes),
  });
  const candidate = buildHistoricalSourceHashDisposition({
    domainId: 'items',
    currentPolicy: policy('items'),
    entries: [entry],
    generatedAt: '2026-08-29T05:00:00.000Z',
  });

  assert.equal(candidate.artifactKind, 'l1-historical-source-hash-disposition');
  assert.equal(candidate.status, 'candidate');
  assert.equal(candidate.proposalOnly, true);
  assert.equal(candidate.disposition, 'exclude_from_l1_qualification');
  assert.equal(candidate.entries.length, 1);
  assert.equal(candidate.entries[0].source.declaredSha256, candidate.entries[0].source.semanticJsonSha256);
  assert.notEqual(candidate.entries[0].source.declaredSha256, candidate.entries[0].source.actualByteSha256);
  assert.match(candidate.artifactHash, /^sha256:[0-9a-f]{64}$/);
});

test('approval changes only the review envelope and preserves the exact content identity', () => {
  const fixture = authorizedFixture({
    domainId: 'projectiles',
    sourceBytes: Buffer.from('{"records":[3]}\n'),
  });
  const approved = approveHistoricalSourceHashDisposition({
    candidate: fixture.candidate,
    authorizationContext: fixture.authorizationContext,
    currentTechnicalInput: fixture.currentTechnicalInput,
    repoRoot: fixture.repoRoot,
    now: '2026-08-29T05:02:00.000Z',
  });

  assert.equal(approved.status, 'approved');
  assert.equal(approved.proposalOnly, false);
  assert.equal(approved.approval.actor, 'admin');
  assert.equal(approved.approval.reference, 'user://conversation/2026-08-29/legacy-source-hash-disposition');
  assert.equal(approved.approval.decisionIdentity, fixture.packet.decisionIdentity);
  assert.equal(approved.approval.packetHash, fixture.packet.packetHash);
  assert.equal(approved.approval.packetPath, fixture.packetPathRelative);
  assert.equal(approved.approval.packetFileSha256, fixture.packetFileSha256);
  assert.notEqual(approved.artifactHash, fixture.candidate.artifactHash);
  assert.equal(approved.entries[0].runId, fixture.candidate.entries[0].runId);
  assert.deepEqual(approved.scope, {
    domainId: 'projectiles',
    runId: fixture.candidate.entries[0].runId,
    candidateArtifactHash: fixture.candidate.artifactHash,
  });
});

test('binds each disposition to its candidate-scoped packet path so independent packets can coexist', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-historical-scoped-packet-'));
  const fixture = authorizedFixture({
    repoRoot,
    domainId: 'items',
    sourceBytes: Buffer.from('{"records":[21]}\n'),
  });
  const packetPathRelative = `reports/authorization/canonical/l1-historical-source-hash-disposition/items/${fixture.candidate.artifactHash.slice(7)}/packet.json`;
  const packetPath = path.join(repoRoot, packetPathRelative);
  const packetBytes = fs.readFileSync(fixture.packetPath);
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, packetBytes, { mode: 0o600 });
  const authorizationContext = {
    ...fixture.authorizationContext,
    packetPath,
    packetPathRelative,
    packetFileSha256: byteHash(packetBytes),
  };

  assert.doesNotThrow(() => approveHistoricalSourceHashDisposition({
    candidate: fixture.candidate,
    authorizationContext,
    currentTechnicalInput: fixture.currentTechnicalInput,
    repoRoot,
    now: '2026-08-29T05:03:00.000Z',
  }));
});

test('approval rejects bare Owner fields even when they look valid', () => {
  const candidate = buildHistoricalSourceHashDisposition({
    domainId: 'items',
    currentPolicy: policy('items'),
    entries: [fixtureEntry({
      domainId: 'items',
      sourceBytes: Buffer.from('{"records":[3]}\n'),
      declaredSourceHash: semanticHash(Buffer.from('{"records":[3]}\n')),
    })],
    generatedAt: '2026-08-29T05:01:00.000Z',
  });
  assert.throws(() => approveHistoricalSourceHashDisposition({
    candidate,
    actor: 'admin',
    authorizationReference: 'user://conversation/2026-08-29/legacy-source-hash-disposition',
    approvedAt: '2026-08-29T05:02:00.000Z',
  }), /Owner authorization context|authorization context/i);
});

test('requires a bound Owner authorization context before approving a disposition', () => {
  const fixture = authorizedFixture({ domainId: 'items', sourceBytes: Buffer.from('{"records":[9]}\n') });

  assert.throws(
    () => approveHistoricalSourceHashDisposition({
      candidate: fixture.candidate,
      actor: 'admin',
      authorizationReference: 'user://conversation/2026-08-29/legacy-source-hash-disposition',
      approvedAt: '2026-08-29T05:03:00.000Z',
    }),
    /Owner authorization context|authorization context/i,
  );
});

test('rejects a candidate that is not an exact semantic-JSON mismatch', () => {
  const base = {
    domainId: 'items',
    currentPolicy: policy('items'),
    entries: [fixtureEntry({
      domainId: 'items',
      sourceBytes: Buffer.from('{"records":[1]}\n'),
      declaredSourceHash: semanticHash(Buffer.from('{"records":[1]}\n')),
    })],
    generatedAt: '2026-08-29T05:03:00.000Z',
  };
  for (const [name, change, matcher] of [
    ['unsupported domain', { domainId: 'audio' }, /domain/i],
    ['entry policy set drift', {
      entries: [{
        ...base.entries[0],
        bundle: { policySetHash: `sha256:${'9'.repeat(64)}` },
      }],
    }, /policy(?:[- ]|)set/i],
    ['top-level policy set drift', {
      entries: [{
        ...base.entries[0],
        bundlePolicySetHash: `sha256:${'9'.repeat(64)}`,
      }],
    }, /policy(?:[- ]|)set/i],
    ['bundle operation drift', {
      entries: [{
        ...base.entries[0],
        bundleOperationId: 'automation-items-l1-tampered',
      }],
    }, /operation/i],
    ['bundle path identity conflict', {
      entries: [{
        ...base.entries[0],
        bundleRelativePath: 'reports/authorization/canonical/items/other.bundle.json',
      }],
    }, /path.*identity|path.*match/i],
    ['bundle path directory drift with the same basename', {
      entries: [{
        ...base.entries[0],
        bundleRelativePath: 'reports/authorization/canonical/projectiles/'
          + 'items_l1_auto_0dfbd093f42b072192297f2a727d9c4d.bundle.json',
      }],
    }, /path.*identity|path.*match/i],
    ['conflicting flat and nested bundle hash', {
      entries: [{
        ...base.entries[0],
        bundle: {
          databasePrivatePath: base.entries[0].bundlePath,
          relativePath: 'reports/authorization/canonical/items/'
            + 'items_l1_auto_0dfbd093f42b072192297f2a727d9c4d.bundle.json',
          hash: `sha256:${'9'.repeat(64)}`,
          fileSha256: base.entries[0].bundleFileSha256,
          evidenceHash: base.entries[0].evidenceHash,
          baselineFingerprint: base.entries[0].baselineFingerprint,
        },
      }],
    }, /bundle.*identity|conflict/i],
    ['declared hash is byte hash', { entries: [{ ...base.entries[0], source: { ...base.entries[0].source, declaredSha256: base.entries[0].source.actualByteSha256 } }] }, /semantic|mismatch/i],
    ['missing source path', { entries: [{ ...base.entries[0], source: { ...base.entries[0].source, path: '' } }] }, /source.*path/i],
    ['duplicate run', { entries: [base.entries[0], { ...base.entries[0] }] }, /duplicate/i],
  ]) {
    assert.throws(() => buildHistoricalSourceHashDisposition({ ...base, ...change }), matcher, name);
  }
});

test('writes and reads one content-addressed private disposition without overwrite', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-historical-disposition-'));
  const fixture = authorizedFixture({
    repoRoot,
    domainId: 'shimmer',
    sourceBytes: Buffer.from('{"generation":8}\n'),
  });
  const approved = approveHistoricalSourceHashDisposition({
    candidate: fixture.candidate,
    authorizationContext: fixture.authorizationContext,
    currentTechnicalInput: fixture.currentTechnicalInput,
    repoRoot,
    now: '2026-08-29T05:05:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({ repoRoot, disposition: approved });
  assert.match(written.path, /^reports\/authorization\/canonical\/l1-historical-source-hash-disposition\/shimmer\/[a-f0-9]{64}\/disposition\.json$/);
  assert.equal(written.sha256, `sha256:${createHash('sha256').update(fs.readFileSync(path.join(repoRoot, written.path))).digest('hex')}`);
  assert.equal((fs.lstatSync(path.join(repoRoot, written.path)).mode & 0o077), 0);
  assert.equal(readHistoricalSourceHashDisposition({
    repoRoot,
    dispositionPath: written.path,
    now: '2026-08-29T05:06:00.000Z',
  }).disposition.artifactHash, approved.artifactHash);
  assert.throws(() => writeHistoricalSourceHashDisposition({ repoRoot, disposition: approved }), /overwrite|exists/i);
});

test('read rejects a historical disposition whose bound Owner packet is expired at consumption time', () => {
  const fixture = authorizedFixture({
    domainId: 'items',
    sourceBytes: Buffer.from('{"records":[15]}\n'),
  });
  const approved = approveHistoricalSourceHashDisposition({
    candidate: fixture.candidate,
    authorizationContext: fixture.authorizationContext,
    currentTechnicalInput: fixture.currentTechnicalInput,
    repoRoot: fixture.repoRoot,
    now: '2026-08-29T05:02:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition: approved,
  });

  assert.throws(
    () => readHistoricalSourceHashDisposition({
      repoRoot: fixture.repoRoot,
      dispositionPath: written.path,
      now: '2026-08-29T05:10:00.000Z',
    }),
    /currently valid|expired/i,
  );
});

test('approval rejects packet operation, packet file, and technical identity drift', () => {
  const fixture = authorizedFixture({ domainId: 'items', sourceBytes: Buffer.from('{"records":[10]}\n') });
  for (const [label, mutate, matcher] of [
    ['operation drift', (context) => ({ ...context, operationId: 'other-operation' }), /operation/i],
    ['packet hash drift', (context) => ({ ...context, packetHash: `sha256:${'f'.repeat(64)}` }), /packet.*hash|identity/i],
    ['decision identity drift', (context) => ({ ...context, decisionIdentity: 'different-decision' }), /decision.*identity|identity/i],
    ['packet path drift', (context) => ({ ...context, packetPath: path.join(fixture.repoRoot, 'outside-packet.json') }), /packet.*path|canonical|identity/i],
    ['packet file hash drift', (context) => ({ ...context, packetFileSha256: `sha256:${'f'.repeat(64)}` }), /packet.*file.*hash|identity/i],
    ['policy set drift', () => ({ ...fixture.currentTechnicalInput, policyRows: [{ ...fixture.currentTechnicalInput.policyRows[0], policyHash: `sha256:${'f'.repeat(64)}` }] }), /policy|technical/i],
  ]) {
    const context = label === 'policy set drift'
      ? fixture.authorizationContext
      : mutate(fixture.authorizationContext);
    const currentTechnicalInput = label === 'policy set drift'
      ? mutate(fixture.currentTechnicalInput)
      : fixture.currentTechnicalInput;
    assert.throws(() => approveHistoricalSourceHashDisposition({
      candidate: fixture.candidate,
      authorizationContext: context,
      currentTechnicalInput,
      repoRoot: fixture.repoRoot,
      now: '2026-08-29T05:03:00.000Z',
    }), matcher, label);
  }
});

test('approval enforces the packet authorization window and bounded expiry', () => {
  const fixture = authorizedFixture({ domainId: 'items', sourceBytes: Buffer.from('{"records":[11]}\n') });
  for (const now of ['2026-08-29T04:59:59.000Z', '2026-08-29T06:00:00.000Z']) {
    assert.throws(() => approveHistoricalSourceHashDisposition({
      candidate: fixture.candidate,
      authorizationContext: fixture.authorizationContext,
      currentTechnicalInput: fixture.currentTechnicalInput,
      repoRoot: fixture.repoRoot,
      now,
    }), /authorization.*valid|window|expired/i);
  }
});

test('approval rejects a packet scope that names a different candidate domain or run', () => {
  const fixture = authorizedFixture({ domainId: 'items', sourceBytes: Buffer.from('{"records":[12]}\n') });
  for (const scope of [
    { ...fixture.packet.scope, domainId: 'projectiles' },
    { ...fixture.packet.scope, runId: 'items_l1_auto_other' },
    { ...fixture.packet.scope, candidateArtifactHash: `sha256:${'f'.repeat(64)}` },
  ]) {
    const packet = withPacketMutation(fixture, { scope });
    assert.throws(() => approveHistoricalSourceHashDisposition({
      candidate: fixture.candidate,
      authorizationContext: packet.context,
      currentTechnicalInput: fixture.currentTechnicalInput,
      repoRoot: fixture.repoRoot,
      now: '2026-08-29T05:03:00.000Z',
    }), /scope|domain|run|candidate/i);
  }
});

test('a decision identity cannot authorize two different disposition scopes', () => {
  const first = authorizedFixture({ domainId: 'items', sourceBytes: Buffer.from('{"records":[13]}\n') });
  const second = authorizedFixture({ domainId: 'items', sourceBytes: Buffer.from('{"records":[14]}\n') });
  const reused = withPacketMutation(second, {
    decisionIdentity: first.packet.decisionIdentity,
    authorizationReference: first.packet.authorizationReference,
  });
    assert.throws(() => approveHistoricalSourceHashDisposition({
      candidate: second.candidate,
      authorizationContext: reused.context,
      currentTechnicalInput: second.currentTechnicalInput,
      repoRoot: second.repoRoot,
      now: '2026-08-29T05:03:00.000Z',
      usedDecisionIdentities: new Set([first.packet.decisionIdentity]),
    }), /scope|decision.*identity|reuse|candidate/i);
});

function policy(domainId) {
  return {
    domainId,
    level: 'L1',
    operationalState: 'ACTIVE',
    policyVersion: 1,
    policyHash: POLICY_HASHES[domainId],
    policySetHash: POLICY_SET_HASH,
  };
}

function authorizedFixture({ domainId, sourceBytes, repoRoot = null } = {}) {
  const root = repoRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-historical-auth-'));
  const policyHash = POLICY_HASHES[domainId];
  const policySetHash = computePolicySetHash([{ domainId, policyVersion: 1, policyHash }]);
  const currentPolicy = {
    domainId,
    level: 'L1',
    operationalState: 'ACTIVE',
    policyVersion: 1,
    policyHash,
    policySetHash,
  };
  const entry = fixtureEntry({
    domainId,
    sourceBytes,
    declaredSourceHash: semanticHash(sourceBytes),
  });
  const candidate = buildHistoricalSourceHashDisposition({
    domainId,
    currentPolicy,
    entries: [entry],
    generatedAt: '2026-08-29T05:00:00.000Z',
  });
  const packetPathRelative = 'reports/authorization/canonical/automation-l1-historical-source-hash-disposition.packet.json';
  const packetPath = path.join(root, packetPathRelative);
  const candidatePath = `reports/authorization/canonical/l1-historical-source-hash-disposition/${domainId}/${candidate.artifactHash.slice(7)}/candidate.json`;
  const candidateBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, candidatePath)), { recursive: true });
  fs.writeFileSync(path.join(root, candidatePath), candidateBytes, { mode: 0o600 });
  const serverFingerprint = canonicalServerFingerprint({
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'historical-disposition-test-server',
    databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
  });
  const executionManifest = {
    schemaVersion: 1,
    operationId: 'automation-l1-historical-source-hash-disposition',
    executionClass: 'historical_source_hash_disposition',
    command: ['node', 'pipelines/automation/historical-source-hash-disposition.mjs'],
    inputPaths: [candidatePath],
    outputPaths: [],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: false,
    networkAccess: false,
    historicalSourceHashDisposition: {
      candidatePath,
      candidateFileSha256: byteHash(candidateBytes),
      candidateArtifactHash: candidate.artifactHash,
    },
    scope: {
      domainId,
      runId: candidate.entries[0].runId,
      candidateArtifactHash: candidate.artifactHash,
    },
  };
  const resolved = resolveCanonicalOperationTechnicalInput({
    repoRoot: root,
    operationId: executionManifest.operationId,
    executionManifest,
  });
  assert.deepEqual(resolved.dataEntries.map((entryValue) => entryValue.path), [candidatePath]);
  const technical = {
    ...resolved,
    serverFingerprint,
    policyRows: [{ domainId, policyVersion: 1, policyHash }],
  };
  const requestBase = buildCanonicalAuthorizationRequest({
    ...technical,
    generatedAt: '2026-08-29T05:00:30.000Z',
    expiresAt: '2026-08-29T05:10:00.000Z',
  });
  const requestPayload = { ...requestBase, scope: executionManifest.scope };
  delete requestPayload.requestHash;
  const request = { ...requestPayload, requestHash: canonicalHash(requestPayload) };
  const packetPayload = {
    ...request,
    authorizationStatus: 'AUTHORIZED',
    authorizedAt: '2026-08-29T05:01:00.000Z',
    actor: 'admin',
    reason: 'review legacy source hash contract',
    authorizationReference: 'user://conversation/2026-08-29/legacy-source-hash-disposition',
    decisionIdentity: `historical-disposition-${domainId}-${candidate.entries[0].runId}`,
    missingOwnerFields: [],
  };
  const packet = {
    ...packetPayload,
    packetHash: canonicalHash(packetPayload),
  };
  const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  fs.writeFileSync(packetPath, packetBytes, { mode: 0o600 });
  const packetFileSha256 = byteHash(packetBytes);
  const authorizationContext = {
    ...packet,
    packet,
    packetPath,
    packetPathRelative,
    packetFileSha256,
  };
  return {
    repoRoot: root,
    candidate,
    packet,
    packetPath,
    packetPathRelative,
    packetFileSha256,
    authorizationContext,
    currentTechnicalInput: technical,
  };
}

function withPacketMutation(fixture, mutation) {
  const packet = { ...fixture.packet, ...mutation };
  // Mutations to the packet's request-bound fields must also rebuild the
  // canonical request identity; otherwise the fixture would fail at the
  // generic packet hash gate instead of exercising the intended scope gate.
  const { packetHash: _packetHash, requestHash: _requestHash, authorizedAt, ...requestBody } = packet;
  const requestPayload = {
    ...requestBody,
    authorizationStatus: 'AWAITING_OWNER',
    actor: null,
    reason: null,
    authorizationReference: null,
    decisionIdentity: null,
    missingOwnerFields: ['actor', 'reason', 'authorizationReference', 'decisionIdentity'],
  };
  packet.requestHash = canonicalHash(requestPayload);
  delete packet.packetHash;
  packet.packetHash = canonicalHash(packet);
  const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  fs.writeFileSync(fixture.packetPath, packetBytes, { mode: 0o600 });
  const context = {
    ...packet,
    packet,
    packetPath: fixture.packetPath,
    packetPathRelative: fixture.packetPathRelative,
    packetFileSha256: byteHash(packetBytes),
  };
  return { packet, context };
}

function fixtureEntry({ domainId, runId = {
  items: 'items_l1_auto_0dfbd093f42b072192297f2a727d9c4d',
  projectiles: 'projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e',
  shimmer: 'shimmer_l1_20260824closure01',
}[domainId], sourceBytes, declaredSourceHash }) {
  const sourcePath = `reports/authorization/canonical/${domainId}/${runId}.source.json`;
  const bundlePath = `/legacy/TerraPedia/reports/authorization/canonical/${domainId}/${runId}.bundle.json`;
  return {
    runId,
    runStatus: 'COMPLETED',
    applyStatus: 'COMMITTED',
    bundlePath,
    bundleHash: `sha256:${'a'.repeat(64)}`,
    bundleFileSha256: `sha256:${'b'.repeat(64)}`,
    evidenceHash: `sha256:${'c'.repeat(64)}`,
    baselineFingerprint: `sha256:${'d'.repeat(64)}`,
    source: {
      path: sourcePath,
      declaredSha256: declaredSourceHash,
      actualByteSha256: byteHash(sourceBytes),
      semanticJsonSha256: semanticHash(sourceBytes),
      bytes: sourceBytes.length,
      encoding: 'utf8',
    },
  };
}

function byteHash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function semanticHash(bytes) {
  return byteHash(Buffer.from(JSON.stringify(JSON.parse(bytes.toString('utf8'))), 'utf8'));
}

function canonicalHash(value) {
  return byteHash(Buffer.from(stableJson(value), 'utf8'));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
