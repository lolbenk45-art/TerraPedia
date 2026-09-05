import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFullReconciliationEvidence,
  verifyFullReconciliationEvidence,
} from './reconciliation-evidence-contract.mjs';
import {
  buildL1ReconciliationEvidence,
  writeL1ReconciliationEvidence,
} from './build-l1-reconciliation-evidence.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;

function canonicalHash(value) {
  const canonical = (input) => {
    if (input === null || typeof input !== 'object') return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
    return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`;
  };
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function evidence() {
  return buildFullReconciliationEvidence({
    domainId: 'items',
    runId: 'items-l1-run-03',
    policyVersion: 1,
    policyHash: HASH_A,
    policySetHash: HASH_B,
    sourceHash: HASH_B,
    ownedTableReadbackHash: HASH_C,
    attemptStateHash: HASH_D,
    sourceArtifactPath: 'reports/runtime/test/source.json',
    ownedTableReadbackPath: 'reports/runtime/test/table-readback.json',
    attemptStatePath: 'reports/runtime/test/attempt-state.json',
    completeSourceCoverage: true,
    terminalProgress: true,
    changedUnchangedClassified: true,
    unclassifiedMutationCount: 0,
    unauthorizedMutationCount: 0,
    generationReadback: true,
    activeAttemptCount: 0,
    overdueAttemptCount: 0,
  });
}

test('reconciliation evidence is content-addressed and bound to its run identity', () => {
  const value = evidence();
  assert.equal(verifyFullReconciliationEvidence(value, {
    domainId: 'items',
    runId: 'items-l1-run-03',
    policyVersion: 1,
    policyHash: HASH_A,
    policySetHash: HASH_B,
  }).evidenceHash, value.evidenceHash);
});

test('reconciliation evidence rejects field edits and identity substitution', () => {
  const value = evidence();
  assert.throws(() => verifyFullReconciliationEvidence({ ...value, terminalProgress: false }), /required|hash/i);
  assert.throws(() => verifyFullReconciliationEvidence(value, { runId: 'other-run' }), /runId/);
  assert.throws(() => verifyFullReconciliationEvidence(value, { policySetHash: HASH_C }), /policy-set hash/);
});

test('reconciliation evidence rejects unexplained mutations and missing source coverage', () => {
  assert.throws(() => buildFullReconciliationEvidence({
    ...evidence(),
    unclassifiedMutationCount: 1,
  }), /unclassified mutation/);
  assert.throws(() => buildFullReconciliationEvidence({
    ...evidence(),
    completeSourceCoverage: false,
  }), /complete source coverage/);
});

test('read-only producer binds frozen source, table readback, attempt state, and exact L1 bundle', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reconciliation-'));
  const bundlePath = 'reports/authorization/canonical/automation-items-l1/bundle.json';
  const sourcePath = 'reports/authorization/canonical/automation-items-l1/source.json';
  const sourceCoveragePath = 'reports/runtime/l1-reconciliation/items/items_l1_20260826_01/source-coverage.json';
  const tablePath = 'reports/runtime/l1-reconciliation/items/items_l1_20260826_01/owned-table-readback.json';
  const attemptPath = 'reports/runtime/l1-reconciliation/items/items_l1_20260826_01/attempt-state.json';
  const write = (relativePath, value) => {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    return `sha256:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`;
  };
  const sourceHash = write(sourcePath, { frozen: 'source' });
  const bundle = {
    schemaVersion: 1,
    operationId: 'automation-items-l1',
    runId: 'items_l1_20260826_01',
    domainId: 'items',
    databaseName: 'terria_v1_local',
    policy: { level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B },
    source: { path: sourcePath, sha256: sourceHash },
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
  };
  bundle.bundleHash = canonicalHash(bundle);
  write(bundlePath, bundle);
  write(sourceCoveragePath, {
    schemaVersion: 1, artifactKind: 'l1-source-coverage', domainId: 'items', runId: 'items_l1_20260826_01',
    sourcePath, sourceSha256: sourceHash, completeSourceCoverage: true, terminalProgress: true, unclassifiedCount: 0,
  });
  write(tablePath, {
    schemaVersion: 1, artifactKind: 'l1-owned-table-readback', domainId: 'items', runId: 'items_l1_20260826_01',
    ownedTables: [{ databaseRole: 'local', table: 'items' }], generationReadback: true, unauthorizedMutationCount: 0,
  });
  write(attemptPath, {
    schemaVersion: 1, artifactKind: 'l1-attempt-state', domainId: 'items', runId: 'items_l1_20260826_01',
    activeAttemptCount: 0, overdueAttemptCount: 0,
  });
  const evidence = buildL1ReconciliationEvidence({
    repoRoot, bundlePath, sourceCoveragePath, ownedTableReadbackPath: tablePath, attemptStatePath: attemptPath,
  });
  assert.equal(evidence.fullReconciliation, true);
  assert.equal(evidence.domainId, 'items');
  assert.equal(evidence.runId, 'items_l1_20260826_01');
  assert.equal(verifyFullReconciliationEvidence(evidence, {
    domainId: 'items', runId: 'items_l1_20260826_01', policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B,
  }).evidenceHash, evidence.evidenceHash);
});

test('read-only producer accepts a bounded activation-gated L2 automatic bundle', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-automatic-reconciliation-'));
  const runId = 'items_l1_auto_20260831_01';
  const bundlePath = 'reports/authorization/canonical/automatic/items/bundle.json';
  const sourcePath = 'reports/authorization/canonical/automatic/items/source.json';
  const root = `reports/runtime/l1-reconciliation/items/${runId}`;
  const sourceCoveragePath = `${root}/source-coverage.json`;
  const tablePath = `${root}/owned-table-readback.json`;
  const attemptPath = `${root}/attempt-state.json`;
  const sourceDispatchIdentity = {
    sourceFingerprint: HASH_C,
    sourceRunIdentity: '2026-08-31T12:00:00.000Z',
    sourceContentIdentity: HASH_D,
  };
  const write = (relativePath, value) => {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    return `sha256:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`;
  };
  const sourceHash = write(sourcePath, { frozen: 'automatic-source' });
  const ownedTables = [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }];
  const bundle = {
    schemaVersion: 1,
    operationId: 'automation-items-l1',
    runId,
    domainId: 'items',
    databaseName: 'terria_v1_local',
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: {
      level: 'L2', operationalState: 'ACTIVE', policyVersion: 2, policyHash: HASH_A, policySetHash: HASH_B,
      policyJson: { ownedTables },
    },
    source: { path: sourcePath, sha256: sourceHash },
    sourceDispatchIdentity,
    ownedTables,
  };
  bundle.bundleHash = canonicalHash(bundle);
  write(bundlePath, bundle);
  write(sourceCoveragePath, {
    schemaVersion: 1, artifactKind: 'l1-source-coverage', domainId: 'items', runId,
    sourcePath, sourceSha256: sourceHash, completeSourceCoverage: true, terminalProgress: true, unclassifiedCount: 0,
    sourceDispatchIdentity,
  });
  write(tablePath, {
    schemaVersion: 1, artifactKind: 'l1-owned-table-readback', domainId: 'items', runId,
    ownedTables, generationReadback: true, unauthorizedMutationCount: 0, unclassifiedMutationCount: 0,
    sourceDispatchIdentity,
  });
  write(attemptPath, {
    schemaVersion: 1, artifactKind: 'l1-attempt-state', domainId: 'items', runId,
    activeAttemptCount: 0, overdueAttemptCount: 0,
    sourceDispatchIdentity,
  });

  const result = buildL1ReconciliationEvidence({
    repoRoot,
    bundlePath,
    sourceCoveragePath,
    ownedTableReadbackPath: tablePath,
    attemptStatePath: attemptPath,
  });
  assert.equal(result.fullReconciliation, true);
  assert.equal(result.policyVersion, 2);
  assert.deepEqual(result.sourceDispatchIdentity, sourceDispatchIdentity);

  write(attemptPath, {
    schemaVersion: 1, artifactKind: 'l1-attempt-state', domainId: 'items', runId,
    activeAttemptCount: 0, overdueAttemptCount: 0,
    sourceDispatchIdentity: {
      ...sourceDispatchIdentity,
      sourceContentIdentity: HASH_A,
    },
  });
  assert.throws(
    () => buildL1ReconciliationEvidence({
      repoRoot,
      bundlePath,
      sourceCoveragePath,
      ownedTableReadbackPath: tablePath,
      attemptStatePath: attemptPath,
    }),
    /source dispatch identity/i,
  );
});

test('reconciliation producer rejects incomplete source coverage and refuses overwrite', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reconciliation-'));
  assert.throws(() => buildL1ReconciliationEvidence({ repoRoot }), /bundlePath|bundle/i);
  const outputPath = 'reports/runtime/l1-reconciliation/items/items-l1-run-03/reconciliation-evidence.json';
  const outputAbsPath = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true });
  fs.writeFileSync(outputAbsPath, '{}\n', { mode: 0o600 });
  assert.throws(() => writeL1ReconciliationEvidence({ repoRoot, evidence: evidence(), outputPath }), /exists|overwrite/i);
});

test('reconciliation producer rejects evidence artifacts outside the exact L1 run root', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reconciliation-path-'));
  const bundlePath = 'reports/authorization/canonical/automation-items-l1/bundle.json';
  const strictRoot = 'reports/runtime/l1-reconciliation/items/items_l1_20260826_01';
  const sourcePath = `${strictRoot}/source-coverage.json`;
  const tablePath = `${strictRoot}/owned-table-readback.json`;
  const attemptPath = `${strictRoot}/attempt-state.json`;
  const write = (relativePath, value) => {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  };
  const sourceValue = { source: true };
  const sourceBytes = Buffer.from(`${JSON.stringify(sourceValue)}\n`);
  const sourceHash = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  const bundle = {
    schemaVersion: 1, operationId: 'automation-items-l1', runId: 'items_l1_20260826_01', domainId: 'items',
    databaseName: 'terria_v1_local', policy: { level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B },
    source: { path: 'reports/authorization/canonical/automation-items-l1/source.json', sha256: sourceHash },
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
  };
  bundle.bundleHash = canonicalHash(bundle);
  write(bundlePath, bundle);
  const sourceCoverage = {
    schemaVersion: 1, artifactKind: 'l1-source-coverage', domainId: 'items', runId: 'items_l1_20260826_01',
    sourcePath: 'reports/authorization/canonical/automation-items-l1/source.json', sourceSha256: sourceHash,
    completeSourceCoverage: true, terminalProgress: true, unclassifiedCount: 0,
  };
  const table = { schemaVersion: 1, artifactKind: 'l1-owned-table-readback', domainId: 'items', runId: 'items_l1_20260826_01', ownedTables: [{ databaseRole: 'local', table: 'items' }], generationReadback: true, unauthorizedMutationCount: 0 };
  const attempts = { schemaVersion: 1, artifactKind: 'l1-attempt-state', domainId: 'items', runId: 'items_l1_20260826_01', activeAttemptCount: 0, overdueAttemptCount: 0 };
  write('reports/authorization/canonical/automation-items-l1/source.json', sourceValue);
  write(sourcePath, sourceCoverage);
  write(tablePath, table);
  write(attemptPath, attempts);
  const unsafeSourcePath = 'reports/runtime/items/source-coverage.json';
  write(unsafeSourcePath, sourceCoverage);
  assert.throws(() => buildL1ReconciliationEvidence({
    repoRoot, bundlePath, sourceCoveragePath: unsafeSourcePath, ownedTableReadbackPath: tablePath, attemptStatePath: attemptPath,
  }), /exact L1 run root|path/i);
});

test('reconciliation producer rejects a hand-edited L1 bundle hash', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reconciliation-bundle-integrity-'));
  const bundlePath = 'reports/authorization/canonical/automation-items-l1/bundle.json';
  const sourcePath = 'reports/authorization/canonical/automation-items-l1/source.json';
  const runId = 'items_l1_20260826_01';
  const sourceHash = `${HASH_A}`;
  const bundle = {
    schemaVersion: 1, operationId: 'automation-items-l1', runId, domainId: 'items',
    databaseName: 'terria_v1_local',
    policy: { level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B },
    source: { path: sourcePath, sha256: sourceHash },
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
    bundleHash: HASH_C,
  };
  const write = (relativePath, value) => {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  };
  write(sourcePath, { source: true });
  write(bundlePath, bundle);
  const root = `reports/runtime/l1-reconciliation/items/${runId}`;
  write(`${root}/source-coverage.json`, {
    schemaVersion: 1, artifactKind: 'l1-source-coverage', domainId: 'items', runId,
    sourcePath, sourceSha256: sourceHash, completeSourceCoverage: true, terminalProgress: true, unclassifiedCount: 0,
  });
  write(`${root}/owned-table-readback.json`, {
    schemaVersion: 1, artifactKind: 'l1-owned-table-readback', domainId: 'items', runId,
    ownedTables: bundle.ownedTables, generationReadback: true, unauthorizedMutationCount: 0,
  });
  write(`${root}/attempt-state.json`, {
    schemaVersion: 1, artifactKind: 'l1-attempt-state', domainId: 'items', runId,
    activeAttemptCount: 0, overdueAttemptCount: 0,
  });
  assert.throws(() => buildL1ReconciliationEvidence({
    repoRoot,
    bundlePath,
    sourceCoveragePath: `${root}/source-coverage.json`,
    ownedTableReadbackPath: `${root}/owned-table-readback.json`,
    attemptStatePath: `${root}/attempt-state.json`,
  }), /bundle.*hash|integrity/i);
});
