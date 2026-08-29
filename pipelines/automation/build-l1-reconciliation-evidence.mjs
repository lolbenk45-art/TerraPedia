#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildFullReconciliationEvidence,
  verifyFullReconciliationEvidence,
} from './reconciliation-evidence-contract.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DOMAIN_L1_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l1',
  npcs: 'automation-npcs-l1',
  projectiles: 'automation-projectiles-l1',
  armor_sets: 'automation-armor-sets-l1',
  buffs: 'automation-buffs-l1',
  audio: 'automation-audio-first-l1',
  bosses: 'automation-bosses-first-l1',
  shimmer: 'automation-shimmer-first-l1',
});

export function buildL1ReconciliationEvidence({
  repoRoot = process.cwd(),
  bundlePath,
  sourceCoveragePath,
  ownedTableReadbackPath,
  attemptStatePath,
} = {}) {
  const root = path.resolve(repoRoot);
  const bundle = readJsonArtifact(root, bundlePath, 'L1 bundle', { canonical: true });
  assertBundleIdentity(bundle);
  assertFrozenSource(root, bundle);
  const sourceCoverageRelativePath = normalizeL1EvidencePath(sourceCoveragePath, 'source coverage', bundle, 'source-coverage');
  const tableReadbackRelativePath = normalizeL1EvidencePath(ownedTableReadbackPath, 'owned-table readback', bundle, 'owned-table-readback');
  const attemptStateRelativePath = normalizeL1EvidencePath(attemptStatePath, 'attempt state', bundle, 'attempt-state');
  const sourceCoverage = readJsonArtifact(root, sourceCoverageRelativePath, 'source coverage');
  const tableReadback = readJsonArtifact(root, tableReadbackRelativePath, 'owned-table readback');
  const attemptState = readJsonArtifact(root, attemptStateRelativePath, 'attempt state');
  assertSourceCoverage(sourceCoverage, bundle);
  assertTableReadback(tableReadback, bundle);
  assertAttemptState(attemptState, bundle);

  const evidence = buildFullReconciliationEvidence({
    domainId: bundle.domainId,
    runId: bundle.runId,
    policyVersion: bundle.policy.policyVersion,
    policyHash: bundle.policy.policyHash,
    policySetHash: bundle.policy.policySetHash,
    sourceHash: hashFile(root, sourceCoverageRelativePath, 'source coverage'),
    ownedTableReadbackHash: hashFile(root, tableReadbackRelativePath, 'owned-table readback'),
    attemptStateHash: hashFile(root, attemptStateRelativePath, 'attempt state'),
    sourceArtifactPath: sourceCoverageRelativePath,
    ownedTableReadbackPath: tableReadbackRelativePath,
    attemptStatePath: attemptStateRelativePath,
    completeSourceCoverage: true,
    terminalProgress: true,
    changedUnchangedClassified: Number(tableReadback.unclassifiedMutationCount ?? 0) === 0,
    unclassifiedMutationCount: Number(tableReadback.unclassifiedMutationCount ?? 0),
    unauthorizedMutationCount: Number(tableReadback.unauthorizedMutationCount),
    generationReadback: true,
    activeAttemptCount: Number(attemptState.activeAttemptCount),
    overdueAttemptCount: Number(attemptState.overdueAttemptCount),
  });
  return verifyFullReconciliationEvidence(evidence, {
    domainId: bundle.domainId,
    runId: bundle.runId,
    policyVersion: bundle.policy.policyVersion,
    policyHash: bundle.policy.policyHash,
    policySetHash: bundle.policy.policySetHash,
  });
}

export function writeL1ReconciliationEvidence({
  repoRoot = process.cwd(),
  evidence,
  outputPath,
} = {}) {
  const root = path.resolve(repoRoot);
  verifyFullReconciliationEvidence(evidence, {
    domainId: evidence?.domainId,
    runId: evidence?.runId,
    policyVersion: evidence?.policyVersion,
    policyHash: evidence?.policyHash,
    policySetHash: evidence?.policySetHash,
  });
  const normalizedOutputPath = normalizeL1EvidencePath(
    outputPath,
    'reconciliation evidence output',
    evidence,
    'reconciliation-evidence',
  );
  const absolute = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, normalizedOutputPath),
    label: 'reconciliation evidence output',
    createParent: true,
  });
  assertNoExistingEntry(absolute, 'reconciliation evidence output');
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  fs.writeFileSync(absolute, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({
    path: path.relative(root, absolute).replaceAll('\\', '/'),
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    evidenceHash: evidence.evidenceHash,
  });
}

export function runL1ReconciliationEvidenceCli({ argv = process.argv.slice(2), repoRoot = process.cwd() } = {}) {
  const args = Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    return [key, rest.join('=')];
  }));
  const evidence = buildL1ReconciliationEvidence({
    repoRoot,
    bundlePath: args.bundle,
    sourceCoveragePath: args['source-coverage'],
    ownedTableReadbackPath: args['table-readback'],
    attemptStatePath: args['attempt-state'],
  });
  return writeL1ReconciliationEvidence({ repoRoot, evidence, outputPath: args.output });
}

function assertBundleIdentity(bundle) {
  const domain = requireText(bundle?.domainId, 'bundle.domainId');
  if (DOMAIN_L1_OPERATION_IDS[domain] !== bundle.operationId) {
    throw new Error('L1 bundle operation identity is not exact for its domain');
  }
  if (bundle.databaseName !== 'terria_v1_local' || bundle.policy?.level !== 'L1'
      || bundle.policy?.operationalState !== 'ACTIVE') {
    throw new Error('L1 bundle policy identity is invalid');
  }
  if (!Number.isSafeInteger(bundle.policy.policyVersion) || bundle.policy.policyVersion < 1
      || !HASH_PATTERN.test(bundle.policy.policyHash ?? '')
      || !HASH_PATTERN.test(bundle.policy.policySetHash ?? '')) {
    throw new Error('L1 bundle policy hashes are invalid');
  }
  if (!bundle.source || !HASH_PATTERN.test(bundle.source.sha256 ?? '')) {
    throw new Error('L1 bundle source identity is invalid');
  }
  if (!Array.isArray(bundle.ownedTables) || bundle.ownedTables.length === 0) {
    throw new Error('L1 bundle owned table scope is invalid');
  }
  if (!HASH_PATTERN.test(bundle.bundleHash ?? '')) {
    throw new Error('L1 bundle hash is invalid');
  }
  const { bundleHash, ...body } = bundle;
  if (hashJson(body) !== bundleHash) {
    throw new Error('L1 bundle hash or content mismatch');
  }
}

function assertFrozenSource(root, bundle) {
  const sourcePath = normalizeRelativePath(bundle.source.path, 'bundle source path');
  const absolute = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, sourcePath),
    label: 'L1 bundle source',
  });
  if (hashFile(root, sourcePath, 'L1 bundle source') !== bundle.source.sha256) {
    throw new Error('L1 bundle source hash drifted');
  }
  return absolute;
}

function assertSourceCoverage(value, bundle) {
  assertArtifact(value, 'l1-source-coverage', bundle);
  if (value.completeSourceCoverage !== true || value.terminalProgress !== true
      || Number(value.unclassifiedCount) !== 0
      || normalizeRelativePath(value.sourcePath, 'sourcePath') !== normalizeRelativePath(bundle.source.path, 'bundle source path')
      || value.sourceSha256 !== bundle.source.sha256) {
    throw new Error('source coverage is incomplete or does not bind the frozen source');
  }
}

function assertTableReadback(value, bundle) {
  assertArtifact(value, 'l1-owned-table-readback', bundle);
  if (value.generationReadback !== true || Number(value.unauthorizedMutationCount) !== 0
      || Number(value.unclassifiedMutationCount ?? 0) !== 0
      || JSON.stringify(value.ownedTables) !== JSON.stringify(bundle.ownedTables)) {
    throw new Error('owned-table readback is incomplete or outside the bundle scope');
  }
}

function assertAttemptState(value, bundle) {
  assertArtifact(value, 'l1-attempt-state', bundle);
  if (Number(value.activeAttemptCount) !== 0 || Number(value.overdueAttemptCount) !== 0) {
    throw new Error('attempt state has active or overdue work');
  }
}

function assertArtifact(value, kind, bundle) {
  if (!value || value.schemaVersion !== 1 || value.artifactKind !== kind
      || value.domainId !== bundle.domainId || value.runId !== bundle.runId) {
    throw new Error(`${kind} artifact identity is invalid`);
  }
}

function readJsonArtifact(root, filePath, label, { canonical = false } = {}) {
  const normalized = normalizeRelativePath(filePath, label);
  if (canonical && !normalized.startsWith('reports/authorization/canonical/')) {
    throw new Error(`${label} must be under the canonical authorization report root`);
  }
  const absolute = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, normalized), label });
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(absolute, 'utf8')); } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
  return parsed;
}

function hashFile(root, filePath, label) {
  const normalized = normalizeRelativePath(filePath, label);
  const absolute = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, normalized), label });
  return `sha256:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`;
}

function normalizeRelativePath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.includes('..') || !normalized.startsWith('reports/')) {
    throw new Error(`${label} must be a confined reports path`);
  }
  return normalized;
}

function normalizeL1EvidencePath(value, label, binding, artifactName) {
  const normalized = normalizeRelativePath(value, label);
  const domainId = requireText(binding?.domainId, `${label} domainId`);
  const runId = requireText(binding?.runId, `${label} runId`);
  const expected = `reports/runtime/l1-reconciliation/${domainId}/${runId}/${artifactName}.json`;
  if (normalized !== expected) {
    throw new Error(`${label} must be under the exact L1 run root`);
  }
  return normalized;
}

function assertNoExistingEntry(filePath, label) {
  try {
    fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(runL1ReconciliationEvidenceCli())}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
