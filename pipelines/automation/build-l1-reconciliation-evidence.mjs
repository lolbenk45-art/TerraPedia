#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildFullReconciliationEvidence,
  verifyFullReconciliationEvidence,
} from './reconciliation-evidence-contract.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { automaticReconciliationRoot, assertAutomaticAttemptMatches } from './automatic-execution-artifacts.mjs';

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
  const sourceDispatchIdentity = normalizeSourceDispatchIdentity(bundle.sourceDispatchIdentity);
  assertFrozenSource(root, bundle);
  const sourceCoverageRelativePath = normalizeL1EvidencePath(sourceCoveragePath, 'source coverage', bundle, 'source-coverage');
  const tableReadbackRelativePath = normalizeL1EvidencePath(ownedTableReadbackPath, 'owned-table readback', bundle, 'owned-table-readback');
  const attemptStateRelativePath = normalizeL1EvidencePath(attemptStatePath, 'attempt state', bundle, 'attempt-state');
  const sourceCoverage = readJsonArtifact(root, sourceCoverageRelativePath, 'source coverage');
  const tableReadback = readJsonArtifact(root, tableReadbackRelativePath, 'owned-table readback');
  const attemptState = readJsonArtifact(root, attemptStateRelativePath, 'attempt state');
  assertSourceCoverage(sourceCoverage, bundle, sourceDispatchIdentity);
  assertTableReadback(tableReadback, bundle, sourceDispatchIdentity);
  assertAttemptState(attemptState, bundle, sourceDispatchIdentity);

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
    ...(sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity }),
  });
  return verifyFullReconciliationEvidence(evidence, {
    domainId: bundle.domainId,
    runId: bundle.runId,
    policyVersion: bundle.policy.policyVersion,
    policyHash: bundle.policy.policyHash,
    policySetHash: bundle.policy.policySetHash,
    ...(sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity }),
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
  const executionMode = bundle.executionMode ?? 'MANUAL_OWNER_L1';
  const expectedLevel = executionMode === 'ACTIVATION_GATED_AUTO' ? 'L2' : 'L1';
  if (!['MANUAL_OWNER_L1', 'ACTIVATION_GATED_AUTO'].includes(executionMode)
      || bundle.databaseName !== 'terria_v1_local' || bundle.policy?.level !== expectedLevel
      || bundle.policy?.operationalState !== 'ACTIVE') {
    throw new Error('reconciliation bundle policy identity is invalid');
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
  if (executionMode === 'ACTIVATION_GATED_AUTO') {
    assertAutomaticScopeMatchesPolicy(bundle);
  }
  if (!HASH_PATTERN.test(bundle.bundleHash ?? '')) {
    throw new Error('L1 bundle hash is invalid');
  }
  const { bundleHash, ...body } = bundle;
  if (hashJson(body) !== bundleHash) {
    throw new Error('L1 bundle hash or content mismatch');
  }
}

function assertAutomaticScopeMatchesPolicy(bundle) {
  const normalizeScopes = (value, label) => {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`automatic ${label} owned table scope is invalid`);
    }
    const keys = new Set();
    return value.map((scope) => {
      const normalized = {
        databaseRole: requireText(scope?.databaseRole, `automatic ${label} databaseRole`),
        table: requireText(scope?.table, `automatic ${label} table`),
        fieldGroup: requireText(scope?.fieldGroup, `automatic ${label} fieldGroup`),
        ...(scope?.logicalPredicateHash == null
          ? {}
          : { logicalPredicateHash: requireHash(scope.logicalPredicateHash, `automatic ${label} logicalPredicateHash`) }),
      };
      if (normalized.table === 'npcs' && normalized.logicalPredicateHash == null) {
        throw new Error('automatic shared npcs scope requires a logical predicate hash');
      }
      const key = `${normalized.databaseRole}:${normalized.table}:${normalized.fieldGroup}:${normalized.logicalPredicateHash ?? ''}`;
      if (keys.has(key)) throw new Error(`automatic ${label} owned table scope contains duplicates`);
      keys.add(key);
      return normalized;
    }).sort((left, right) => (
      `${left.databaseRole}:${left.table}:${left.fieldGroup}:${left.logicalPredicateHash ?? ''}`
        .localeCompare(`${right.databaseRole}:${right.table}:${right.fieldGroup}:${right.logicalPredicateHash ?? ''}`)
    ));
  };
  const policyScopes = normalizeScopes(bundle.policy?.policyJson?.ownedTables, 'policy');
  const bundleScopes = normalizeScopes(bundle.ownedTables, 'bundle');
  if (JSON.stringify(policyScopes) !== JSON.stringify(bundleScopes)) {
    throw new Error('automatic reconciliation owned table scope does not match the L2 policy');
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

function assertSourceCoverage(value, bundle, sourceDispatchIdentity) {
  assertArtifact(value, 'l1-source-coverage', bundle);
  assertArtifactSourceDispatchIdentity(value, sourceDispatchIdentity);
  if (value.completeSourceCoverage !== true || value.terminalProgress !== true
      || Number(value.unclassifiedCount) !== 0
      || normalizeRelativePath(value.sourcePath, 'sourcePath') !== normalizeRelativePath(bundle.source.path, 'bundle source path')
      || value.sourceSha256 !== bundle.source.sha256) {
    throw new Error('source coverage is incomplete or does not bind the frozen source');
  }
}

function assertTableReadback(value, bundle, sourceDispatchIdentity) {
  assertArtifact(value, 'l1-owned-table-readback', bundle);
  assertArtifactSourceDispatchIdentity(value, sourceDispatchIdentity);
  if (value.generationReadback !== true || Number(value.unauthorizedMutationCount) !== 0
      || Number(value.unclassifiedMutationCount ?? 0) !== 0
      || JSON.stringify(value.ownedTables) !== JSON.stringify(bundle.ownedTables)) {
    throw new Error('owned-table readback is incomplete or outside the bundle scope');
  }
}

function assertAttemptState(value, bundle, sourceDispatchIdentity) {
  assertArtifact(value, 'l1-attempt-state', bundle);
  assertArtifactSourceDispatchIdentity(value, sourceDispatchIdentity);
  if (Number(value.activeAttemptCount) !== 0 || Number(value.overdueAttemptCount) !== 0) {
    throw new Error('attempt state has active or overdue work');
  }
}

function assertArtifact(value, kind, bundle) {
  if (!value || value.schemaVersion !== 1 || value.artifactKind !== kind
      || value.domainId !== bundle.domainId || value.runId !== bundle.runId) {
    throw new Error(`${kind} artifact identity is invalid`);
  }
  assertAutomaticAttemptMatches(value.automaticAttemptIdentity, bundle.importPlan?.automaticAttemptIdentity, kind);
}

function assertArtifactSourceDispatchIdentity(value, expected) {
  const actual = normalizeSourceDispatchIdentity(value?.sourceDispatchIdentity);
  if (!sameSourceDispatchIdentity(actual, expected)) {
    throw new Error('reconciliation artifact source dispatch identity does not match the frozen bundle');
  }
}

function normalizeSourceDispatchIdentity(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('source dispatch identity must be an object');
  }
  const sourceFingerprint = requireHash(value.sourceFingerprint, 'sourceDispatchIdentity.sourceFingerprint');
  const sourceRunIdentity = requireText(value.sourceRunIdentity, 'sourceDispatchIdentity.sourceRunIdentity');
  if (!Number.isFinite(Date.parse(sourceRunIdentity))) {
    throw new Error('sourceDispatchIdentity.sourceRunIdentity must be an ISO timestamp');
  }
  const sourceContentIdentity = requireHash(value.sourceContentIdentity, 'sourceDispatchIdentity.sourceContentIdentity');
  return { sourceFingerprint, sourceRunIdentity, sourceContentIdentity };
}

function sameSourceDispatchIdentity(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return left.sourceFingerprint === right.sourceFingerprint
    && left.sourceRunIdentity === right.sourceRunIdentity
    && left.sourceContentIdentity === right.sourceContentIdentity;
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
  let root = automaticReconciliationRoot(binding);
  // Final evidence already hashes all three artifact paths and their contents.
  // Recover its execution root from those existing fields without a schema change.
  if (binding.fullReconciliation === true && binding.sourceArtifactPath?.startsWith(`${root}_exec_`)) {
    const suffix = binding.sourceArtifactPath.slice(root.length);
    if (!/^_exec_[a-f0-9]{64}\/source-coverage\.json$/.test(suffix)) {
      throw new Error(`${label} must be under the exact L1 run root`);
    }
    root = path.posix.dirname(binding.sourceArtifactPath);
    if (binding.ownedTableReadbackPath !== `${root}/owned-table-readback.json`
        || binding.attemptStatePath !== `${root}/attempt-state.json`) {
      throw new Error(`${label} must be under the exact L1 run root`);
    }
  }
  const expected = `${root}/${artifactName}.json`;
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

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
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
