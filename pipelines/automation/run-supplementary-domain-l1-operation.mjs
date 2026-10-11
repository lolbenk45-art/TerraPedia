#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadLocalBgmDisplayNameRows,
  runAudioAssetImport,
} from '../import/import-wiki-audio-assets-to-db.mjs';
import { runBossImport } from '../import/import-wiki-bosses-to-db.mjs';
import { runIndependentEntityImport } from '../import/import-independent-entities-to-db.mjs';
import { runBaseItemsImport } from '../import/import-standardized-to-db.mjs';
import {
  applyBundleChanges as applyShimmerBundleChanges,
  assertShimmerImportScopeMatchesPreview,
  buildShimmerImportPreview,
  loadCurrentShimmerScope,
  loadTargetFingerprint,
  loadVerifiedShimmerImportBundle,
} from '../import/import-wiki-shimmer-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  assertL2AutomaticGate,
  extractL2AutomaticDiff,
  getVerifiedSharedNpcsScopeDefinition,
} from './l2-automatic-ceiling.mjs';
import {
  assertTableOnlyRecorderCanProveScopes,
  buildReadOnlyAutomaticL2Diff,
} from './l2-read-only-diff-producer.mjs';
import {
  assertSupplementaryOwnedTables,
  validateSupplementaryL1Bundle,
} from './supplementary-domain-l1-contract.mjs';
import {
  buildL1ReconciliationEvidence,
  writeL1ReconciliationEvidence,
} from './build-l1-reconciliation-evidence.mjs';

import {
  automaticArtifactRunId,
  automaticReconciliationRoot,
  assertAutomaticAttemptMatches,
} from './automatic-execution-artifacts.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CRITICAL_ALERT_RETRY_ROOT = 'reports/runtime/automation-alert-retry';
const CRITICAL_ALERT_RETRY_FILE = 'critical-alert-delivery-retry.json';
const AUTOMATIC_BUNDLE_ROOT = 'reports/authorization/canonical/automatic';
const AUTOMATIC_BUNDLE_FILENAMES = new Set(['bundle.json', 'operation.bundle.json']);
const CLI_RESULT_FILE_NAME = 'result.json';

export function readVerifiedCommittedAutomaticBundle({ repoRoot, manifest, runId, domainId, sourceDispatchIdentity }) {
  const root = resolveCliRepositoryRoot(repoRoot);
  const bundlePath = resolveCliArtifactPath(root, manifest?.privatePath, 'committed manifest privatePath');
  const bytes = readPrivateCliFileBytes(root, bundlePath, 'committed automatic bundle');
  if (sha256Bytes(bytes) !== manifest?.bundleFileHash) throw new Error('committed manifest bundle hash mismatch');
  const bundle = JSON.parse(bytes.toString('utf8'));
  validateSupplementaryL1Bundle(bundle);
  if (bundle.executionMode !== 'ACTIVATION_GATED_AUTO' || bundle.runId !== runId || bundle.domainId !== domainId
      || JSON.stringify(stableValue(bundle.source)) !== JSON.stringify(stableValue(manifest.source))
      || bundle.importPlan.automaticSourceFingerprint !== manifest.automaticSourceFingerprint
      || JSON.stringify(stableValue(bundle.sourceDispatchIdentity)) !== JSON.stringify(stableValue(sourceDispatchIdentity))) {
    throw new Error('committed automatic bundle does not match its persisted source identity');
  }
  assertCliBundleArtifact({ repoRoot: root, inputPath: bundlePath, bundle });
  if (bundle.importPlan?.automaticAttemptIdentity != null) assertAutomaticReconciliationPathBinding(bundle);
  return { bundle, bundlePath };
}

export async function executeSupplementaryL1Operation({
  adapter,
  bundle,
  authorizationContext,
  now = new Date().toISOString(),
  postCommitVerify = null,
} = {}) {
  if (bundle?.executionMode === 'MANUAL_OWNER_L1' && bundle.sourceDispatchIdentity != null) {
    throw new Error('manual L1 bundles must not carry a scheduler source dispatch identity');
  }
  validateSupplementaryL1Bundle(bundle);
  const executionTime = requireTimestamp(now, 'execution time');
  validateAuthorizationContext(authorizationContext, bundle.operationId, executionTime);
  if (bundle.executionMode === 'ACTIVATION_GATED_AUTO'
      && authorizationContext?.executionMode !== 'ACTIVATION_GATED_AUTO') {
    throw new Error('automatic bundle requires an ACTIVATION_GATED_AUTO authorization context');
  }
  if (bundle.executionMode === 'MANUAL_OWNER_L1'
      && authorizationContext?.executionMode === 'ACTIVATION_GATED_AUTO') {
    throw new Error('manual L1 bundle cannot use an automatic authorization context');
  }
  if (bundle.executionMode === 'ACTIVATION_GATED_AUTO') {
    assertAutomaticScopeCanEnterTransaction(bundle.ownedTables);
  }
  assertShimmerImporterWriteScope(bundle);
  requireAdapter(adapter);
  await adapter.begin();
  let committed = false;
  let commitStatus = 'not_attempted';
  let importSummary;
  try {
    const current = await adapter.lockCurrentContext(bundle, executionTime);
    assertCurrentContext({ current, bundle, authorizationContext, executionTime });
    if (bundle.executionMode === 'ACTIVATION_GATED_AUTO') {
      await revalidateAutomaticActivationAfterLock({
        adapter,
        bundle,
        current,
        authorizationContext,
        executionTime,
      });
    }
    const automaticGate = bundle.executionMode === 'ACTIVATION_GATED_AUTO'
      ? await runAutomaticL2Gate({ adapter, current, bundle, executionTime })
      : null;
    if (bundle.executionMode === 'ACTIVATION_GATED_AUTO') {
      await revalidateAutomaticActivationAfterLock({
        adapter,
        bundle,
        current,
        authorizationContext,
        executionTime,
      });
    }
    await adapter.persistRunChain(bundle, authorizationContext, automaticGate);
    importSummary = await adapter.applyFrozenImport(bundle.importPlan, bundle);
    assertImportSummaryHealthy(importSummary);
    await adapter.advanceMutationGenerations(bundle);
    if (bundle.reconciliationInput) {
      if (typeof adapter.writeReconciliationInputs !== 'function') {
        throw new Error('reconciliation input producer is required for full reconciliation');
      }
      await adapter.writeReconciliationInputs({
        bundle,
        importSummary,
        reconciliationInput: bundle.reconciliationInput,
        executionTime,
      });
      const evidence = buildL1ReconciliationEvidence({
        repoRoot: adapter.repoRoot ?? process.cwd(),
        bundlePath: relativeRepositoryPath(adapter.repoRoot ?? process.cwd(), adapter.bundlePath),
        sourceCoveragePath: bundle.reconciliationInput.sourceCoveragePath,
        ownedTableReadbackPath: bundle.reconciliationInput.ownedTableReadbackPath,
        attemptStatePath: bundle.reconciliationInput.attemptStatePath,
      });
      const written = writeL1ReconciliationEvidence({
        repoRoot: adapter.repoRoot ?? process.cwd(),
        evidence,
        outputPath: bundle.reconciliationInput.outputPath,
      });
      if (typeof adapter.persistReconciliationEvidence !== 'function') {
        throw new Error('reconciliation evidence persistence is required when reconciliationInput is present');
      }
      await adapter.persistReconciliationEvidence({ bundle, evidence, written });
    }
    const completedAt = executionTime;
    await adapter.persistCommittedApply({ bundle, importSummary, completedAt });
    commitStatus = 'attempted';
    try {
      await adapter.commit();
      committed = true;
      commitStatus = 'committed';
    } catch (commitError) {
      // A lost acknowledgement does not prove that the transaction rolled
      // back. Treat the database outcome as ambiguous and use the guarded
      // compensation path instead of issuing an unsafe rollback.
      commitStatus = 'ambiguous';
      committed = true;
      throw commitError;
    }
    const verify = postCommitVerify ?? adapter.postCommitVerify;
    if (typeof verify === 'function') {
      const verification = await verify({ bundle, importSummary, completedAt });
      if (verification && verification.verified === false) {
        throw new Error('post-commit verification failed');
      }
    }
    return Object.freeze({
      schemaVersion: 1,
      operationId: bundle.operationId,
      runId: bundle.runId,
      domainId: bundle.domainId,
      status: 'completed',
      bundleHash: bundle.bundleHash,
      policySetHash: bundle.policy.policySetHash,
      ...(automaticGate == null ? {} : { automaticGate }),
      importSummary,
      completedAt,
    });
  } catch (caughtError) {
    const error = toWritableRecoveryError(caughtError);
    let compensationStatus = 'not_attempted';
    let compensationStatePersistenceError = null;
    if (!committed) {
      try {
        await adapter.rollback();
      } catch (rollbackError) {
        compensationStatus = 'rollback_failed';
        appendSuppressed(error, rollbackError);
      }
    } else if (typeof adapter.compensate === 'function') {
      try {
        const compensation = await adapter.compensate({
          bundle,
          importSummary,
          reason: 'post_commit_verification_failed',
          error,
        });
        if (compensation?.status !== 'compensated') {
          throw new Error('post-commit compensation did not complete');
        }
        compensationStatus = 'compensated';
        error.compensation = compensation;
      } catch (compensationError) {
        compensationStatus = 'compensation_failed';
        appendSuppressed(error, compensationError);
        compensationStatePersistenceError = await persistCompensationFailedState(
          adapter,
          bundle,
          compensationError,
          error,
        );
      }
    } else {
      compensationStatus = 'compensation_unavailable';
      compensationStatePersistenceError = await persistCompensationFailedState(adapter, bundle, error, error);
    }
    if (compensationStatePersistenceError != null) {
      compensationStatus = 'compensation_state_unconfirmed';
    }
    const alertDelivery = await recordOperationFailureAlert(adapter, bundle, error, {
      committed,
      commitStatus,
      compensationStatus,
    });
    if (alertDelivery?.status === 'retry_required') {
      throw criticalAlertDeliveryRetryError(error, {
        compensationStatus,
        alertDelivery,
      });
    }
    throw error;
  }
}

/**
 * The legacy SQL-intent recorder can prove only whole-table scopes.  Let a
 * registered structured producer reach the L2 gate for the two shared-NPC
 * partitions, while rejecting every other scoped claim before a transaction
 * or persistence side effect begins.
 */
function assertAutomaticScopeCanEnterTransaction(ownedTables) {
  for (const scope of ownedTables ?? []) {
    if (scope?.fieldGroup === 'all_columns' && scope?.logicalPredicateHash == null) continue;
    const definition = getVerifiedSharedNpcsScopeDefinition(scope);
    if (!definition
        || scope.table !== definition.table
        || scope.fieldGroup !== definition.fieldGroup
        || scope.logicalPredicateHash !== definition.logicalPredicateHash) {
      assertTableOnlyRecorderCanProveScopes(ownedTables);
    }
  }
}

async function revalidateAutomaticActivationAfterLock({
  adapter,
  bundle,
  current,
  authorizationContext,
  executionTime,
}) {
  if (typeof adapter?.readDatabaseTime !== 'function') {
    throw new Error('automatic activation database clock revalidation is required');
  }
  const observed = await adapter.readDatabaseTime({
    bundle,
    current,
    authorizationContext,
    executionTime,
  });
  if (observed == null) {
    throw new Error('scheduler activation expired or was revoked before automatic mutation');
  }
  const activation = typeof observed === 'object'
    ? {
        decisionIdentity: observed.decisionIdentity ?? authorizationContext.activationDecisionIdentity,
        packetHash: observed.packetHash ?? authorizationContext.activationPacketHash,
        policySetHash: observed.policySetHash ?? authorizationContext.activationPolicySetHash,
        actor: observed.actor ?? authorizationContext.actor,
        reason: observed.reason ?? authorizationContext.reason,
        authorizationReference: observed.authorizationReference ?? authorizationContext.authorizationReference,
        authorizedAt: observed.authorizedAt ?? authorizationContext.authorizedAt,
        expiresAt: observed.expiresAt ?? authorizationContext.expiresAt,
      }
    : {
        decisionIdentity: authorizationContext.activationDecisionIdentity,
        packetHash: authorizationContext.activationPacketHash,
        policySetHash: authorizationContext.activationPolicySetHash,
        actor: authorizationContext.actor,
        reason: authorizationContext.reason,
        authorizationReference: authorizationContext.authorizationReference,
        authorizedAt: authorizationContext.authorizedAt,
        expiresAt: authorizationContext.expiresAt,
      };
  assertActivationMatchesAuthorization(activation, authorizationContext);
  const databaseTime = typeof observed === 'object'
    ? observed.databaseTime ?? observed.currentTime ?? observed.now
    : observed;
  assertActivationValidAt(activation, databaseTime);
}

function assertActivationMatchesAuthorization(activation, authorizationContext) {
  const expected = {
    decisionIdentity: authorizationContext.activationDecisionIdentity,
    packetHash: authorizationContext.activationPacketHash,
    policySetHash: authorizationContext.activationPolicySetHash,
    actor: authorizationContext.actor,
    reason: authorizationContext.reason,
    authorizationReference: authorizationContext.authorizationReference,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (activation[field] !== expectedValue) {
      throw new Error(`scheduler activation changed before automatic mutation (${field})`);
    }
  }
}

function assertActivationValidAt(activation, executionTime) {
  const authorizedAt = requireTimestamp(activation?.authorizedAt, 'authorization start');
  const expiresAt = requireTimestamp(activation?.expiresAt, 'authorization expiry');
  const effectiveTime = requireTimestamp(executionTime, 'current execution time');
  if (Date.parse(effectiveTime) < Date.parse(authorizedAt)
      || Date.parse(effectiveTime) >= Date.parse(expiresAt)) {
    throw new Error('scheduler activation is not valid at mutation time');
  }
}

async function persistCompensationFailedState(adapter, bundle, compensationError, originalError) {
  if (typeof adapter?.markCompensationFailed !== 'function') {
    const missingStateWriter = new Error('COMPENSATION_FAILED state persistence is required after post-commit compensation failure');
    appendSuppressed(originalError, missingStateWriter);
    return missingStateWriter;
  }
  try {
    const confirmation = await adapter.markCompensationFailed({ bundle, error: compensationError });
    assertCompensationFailedConfirmation(confirmation, bundle);
    return null;
  } catch (statusError) {
    appendSuppressed(originalError, statusError);
    return statusError;
  }
}

function assertCompensationFailedConfirmation(confirmation, bundle) {
  if (confirmation?.status !== 'COMPENSATION_FAILED'
      || Number(confirmation?.applyAffectedRows) !== 1
      || Number(confirmation?.runAffectedRows) !== 1) {
    throw new Error('COMPENSATION_FAILED state confirmation is invalid');
  }
  const apply = confirmation?.readback?.apply;
  if (apply?.runId !== bundle.runId
      || apply?.bundleHash !== bundle.bundleHash
      || apply?.status !== 'COMPENSATION_FAILED') {
    throw new Error('COMPENSATION_FAILED apply state readback is invalid');
  }
  const run = confirmation?.readback?.run;
  if (run?.runId !== bundle.runId || run?.status !== 'COMPENSATION_FAILED') {
    throw new Error('COMPENSATION_FAILED run state readback is invalid');
  }
}

async function recordOperationFailureAlert(
  adapter,
  bundle,
  error,
  { committed, commitStatus, compensationStatus },
) {
  const severity = compensationStatus === 'compensated' ? 'WARNING' : 'CRITICAL';
  const phase = committed ? 'post-commit-verification' : 'pre-commit-apply';
  const dedupeKey = `automation:${bundle.domainId}:${bundle.runId}:${phase}`;
  const details = {
    title: alertTitle({ committed, compensationStatus }),
    details: safeErrorMessage(error),
    reason: alertReason({ committed, compensationStatus }),
    compensationStatus,
    commitStatus,
    domain: bundle.domainId,
    runId: bundle.runId,
    operationId: bundle.operationId,
  };
  if (severity === 'CRITICAL' && compensationStatus === 'compensation_state_unconfirmed') {
    return persistCriticalAlertRetry(adapter, bundle, error, {
      compensationStatus,
      dedupeKey,
      reason: 'compensation_state_persistence_failed',
    });
  }
  if (typeof adapter?.recordAlert !== 'function') {
    return severity === 'CRITICAL'
      ? persistCriticalAlertRetry(adapter, bundle, error, {
          compensationStatus,
          dedupeKey,
          reason: 'alert_adapter_unavailable',
        })
      : Object.freeze({ status: 'unavailable', severity, dedupeKey });
  }
  try {
    await adapter.recordAlert({
      bundle,
      runId: committed ? bundle.runId : null,
      severity,
      dedupeKey,
      details,
    });
    return Object.freeze({ status: 'delivered', severity, dedupeKey });
  } catch (alertError) {
    appendSuppressed(error, alertError);
    return severity === 'CRITICAL'
      ? persistCriticalAlertRetry(adapter, bundle, error, {
          compensationStatus,
          dedupeKey,
          reason: 'alert_persistence_failed',
        })
      : Object.freeze({ status: 'failed', severity, dedupeKey });
  }
}

function alertTitle({ committed, compensationStatus }) {
  if (!committed) return 'Automatic import failed';
  if (compensationStatus === 'compensated') return 'Automatic import was compensated';
  if (compensationStatus === 'compensation_unavailable') {
    return 'Automatic import compensation is unavailable';
  }
  return 'Automatic import compensation failed';
}

function alertReason({ committed, compensationStatus }) {
  if (!committed) return 'automatic_import_failed';
  if (compensationStatus === 'compensated') return 'post_commit_verification_failed';
  if (compensationStatus === 'compensation_unavailable') return 'post_commit_compensation_unavailable';
  if (compensationStatus === 'compensation_state_unconfirmed') {
    return 'compensation_state_persistence_failed';
  }
  return 'post_commit_compensation_failed';
}

async function persistCriticalAlertRetry(adapter, bundle, error, {
  compensationStatus,
  dedupeKey,
  reason,
}) {
  const retry = Object.freeze({
    schemaVersion: 1,
    status: 'PENDING',
    compensationStatus,
    reason,
    dedupeKey,
    domainId: bundle.domainId,
    runId: bundle.runId,
    operationId: bundle.operationId,
    originalFailure: Object.freeze({
      message: safeErrorMessage(error),
      code: safeStringProperty(error, 'code'),
    }),
  });
  try {
    const retryArtifact = typeof adapter?.persistCriticalAlertRetry === 'function'
      ? await adapter.persistCriticalAlertRetry({ retry })
      : persistCriticalAlertRetryArtifact({
          repoRoot: adapter?.repoRoot ?? process.cwd(),
          retry,
        });
    return Object.freeze({
      status: 'retry_required',
      severity: 'CRITICAL',
      dedupeKey,
      reason,
      retryArtifact: normalizeRetryArtifact(retryArtifact),
    });
  } catch (retryPersistenceError) {
    appendSuppressed(error, retryPersistenceError);
    return Object.freeze({
      status: 'retry_required',
      severity: 'CRITICAL',
      dedupeKey,
      reason,
      retryArtifact: null,
      retryPersistenceStatus: 'failed',
      retryPersistenceCode: 'critical_alert_retry_artifact_persistence_failed',
    });
  }
}

function normalizeRetryArtifact(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('critical alert retry artifact metadata is required');
  }
  const artifactPath = normalizeCriticalAlertRetryArtifactPath(value.path);
  const sha256 = requireText(value.sha256, 'critical alert retry artifact sha256');
  if (!HASH_PATTERN.test(sha256)) throw new Error('critical alert retry artifact sha256 is invalid');
  return Object.freeze({ path: artifactPath, sha256 });
}

function normalizeCriticalAlertRetryArtifactPath(value) {
  const artifactPath = requireText(value, 'critical alert retry artifact path');
  if (artifactPath.includes('\\') || artifactPath.startsWith('/') || /^[A-Za-z]:/.test(artifactPath)) {
    throw new Error('critical alert retry artifact path must be a safe repository-relative path');
  }
  const segments = artifactPath.split('/');
  if (segments.length !== 6
      || segments[0] !== 'reports'
      || segments[1] !== 'runtime'
      || segments[2] !== 'automation-alert-retry'
      || segments[5] !== CRITICAL_ALERT_RETRY_FILE
      || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('critical alert retry artifact path must be a safe repository-relative path');
  }
  requireArtifactPathSegment(segments[3], 'critical alert retry artifact domainId');
  requireArtifactPathSegment(segments[4], 'critical alert retry artifact runId');
  return segments.join('/');
}

export function persistCriticalAlertRetryArtifact({ repoRoot, retry } = {}) {
  if (!retry || typeof retry !== 'object') {
    throw new TypeError('critical alert retry payload is required');
  }
  assertSecureRetryArtifactPublicationSupported();
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const domainId = requireArtifactPathSegment(retry.domainId, 'critical alert retry domainId');
  const runId = requireArtifactPathSegment(retry.runId, 'critical alert retry runId');
  const relativePath = criticalAlertRetryArtifactRelativePath(domainId, runId);
  const artifactPath = path.resolve(root, relativePath);
  const artifactDirectoryPath = path.dirname(artifactPath);
  const stagingDirectoryPath = path.join(root, CRITICAL_ALERT_RETRY_ROOT, '.staging');
  const requiredDirectoryPaths = buildRetryArtifactDirectoryPathSet({
    repoRoot: root,
    artifactDirectoryPath,
    stagingDirectoryPath,
  });
  // Node 22 has no stable dirfd/linkat binding.  The remaining pathname
  // publication window is therefore bounded by a dedicated service UID and
  // owner-only directory write permissions.  Check every existing target and
  // staging ancestor before confinement is allowed to create any descendant.
  assertRetryArtifactTrustBoundary({
    repoRoot: root,
    artifactDirectoryPath,
    stagingDirectoryPath,
  });
  const existingDirectoryIdentities = snapshotExistingRetryArtifactDirectories(requiredDirectoryPaths);
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: artifactPath,
    label: 'critical alert delivery retry artifact',
    createParent: true,
  });
  const bytes = Buffer.from(`${JSON.stringify(retry, null, 2)}\n`, 'utf8');
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.join(stagingDirectoryPath, `${CRITICAL_ALERT_RETRY_FILE}.tmp`),
    label: 'critical alert retry staging directory',
    createParent: true,
  });
  assertRetryArtifactTrustBoundary({
    repoRoot: root,
    artifactDirectoryPath,
    stagingDirectoryPath,
  });
  const publicationDirectoryIdentities = captureRetryArtifactDirectoryIdentities({
    directoryPaths: requiredDirectoryPaths,
    existingDirectoryIdentities,
  });
  const createdDirectoryPaths = requiredDirectoryPaths.filter(
    (directoryPath) => !existingDirectoryIdentities.has(directoryPath),
  );

  // Bind the destination only long enough to capture its identity.  Keeping
  // this descriptor open while writing would allow a renamed directory to be
  // used as an external staging or publication location.
  const targetDirectoryFd = openBoundRetryArtifactDirectory(artifactDirectoryPath, { createMissing: false });
  let initialIdentity;
  try {
    initialIdentity = fs.fstatSync(targetDirectoryFd);
    assertRetryArtifactDirectoryIdentity(artifactPath, initialIdentity, { createMissing: false });
  } finally {
    fs.closeSync(targetDirectoryFd);
  }

  // Stage under a separate, private directory so target-parent relocation
  // cannot redirect the bytes written before the final identity check.
  const stagingDirectoryFd = openBoundRetryArtifactDirectory(stagingDirectoryPath, { createMissing: false });
  const descriptorStagingDirectoryPath = descriptorDirectoryPathFor(stagingDirectoryFd);
  let temporaryFd = null;
  let temporaryPath = null;
  try {
    ({ temporaryPath, temporaryFd } = createRetryArtifactTemporaryFile({
      descriptorDirectoryPath: descriptorStagingDirectoryPath,
    }));
    fs.writeFileSync(temporaryFd, bytes);
    fs.fchmodSync(temporaryFd, 0o600);
    fs.fsyncSync(temporaryFd);
    fs.closeSync(temporaryFd);
    temporaryFd = null;

    // Do not recreate a moved or missing target during this revalidation.
    assertRetryArtifactTrustBoundary({
      repoRoot: root,
      artifactDirectoryPath,
      stagingDirectoryPath,
    });
    assertRetryArtifactDirectoryIdentity(artifactPath, initialIdentity, { createMissing: false });
    // A hard link is an atomic no-overwrite publish.  Unlike rename, it
    // cannot replace an existing retry record or follow a destination link.
    fs.linkSync(temporaryPath, artifactPath);
    assertRetryArtifactDirectoryIdentity(artifactPath, initialIdentity, { createMissing: false });
    fs.unlinkSync(temporaryPath);
    temporaryPath = null;
    syncRetryArtifactPublicationDirectories({
      repoRoot: root,
      artifactDirectoryPath,
      stagingDirectoryPath,
      publicationDirectoryIdentities,
      createdDirectoryPaths,
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(
        `critical alert delivery retry artifact already exists; overwrite is forbidden: ${relativePath}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    if (temporaryPath != null) fs.unlinkSync(temporaryPath);
    fs.closeSync(stagingDirectoryFd);
  }
  return Object.freeze({
    path: relativePath,
    sha256: sha256Bytes(bytes),
  });
}

function assertSecureRetryArtifactPublicationSupported() {
  if (process.platform !== 'linux'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')
      || typeof process.getuid !== 'function') {
    throw new Error('secure critical alert retry artifact publication is unavailable on this platform');
  }
}

function assertRetryArtifactTrustBoundary({
  repoRoot,
  artifactDirectoryPath = null,
  stagingDirectoryPath = null,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const schedulerUid = process.getuid();
  const paths = [root, artifactDirectoryPath, stagingDirectoryPath].filter(Boolean);
  const visited = new Set();
  for (const candidatePath of paths) {
    const candidate = path.resolve(candidatePath);
    const relative = path.relative(root, candidate);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('critical alert retry artifact path is outside the repository trust boundary');
    }
    let current = root;
    const segments = relative ? relative.split(path.sep) : [];
    for (const segment of [''].concat(segments)) {
      if (segment) current = path.join(current, segment);
      if (visited.has(current)) continue;
      visited.add(current);
      let stat;
      try {
        stat = fs.lstatSync(current);
      } catch (error) {
        if (error?.code === 'ENOENT') break;
        throw new Error('critical alert retry artifact trust boundary is unavailable', { cause: error });
      }
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('critical alert retry artifact trust boundary requires canonical ordinary directories');
      }
      if (Number(stat.uid) !== Number(schedulerUid)) {
        throw new Error('critical alert retry artifact trust boundary requires scheduler UID ownership');
      }
      if ((stat.mode & 0o022) !== 0) {
        throw new Error('critical alert retry artifact trust boundary requires owner-only writable directories');
      }
      let realPath;
      try {
        realPath = fs.realpathSync(current);
      } catch (error) {
        throw new Error('critical alert retry artifact trust boundary cannot resolve directory identity', { cause: error });
      }
      if (path.resolve(realPath) !== current) {
        throw new Error('critical alert retry artifact trust boundary requires canonical directory paths');
      }
    }
  }
}

function buildRetryArtifactDirectoryPathSet({
  repoRoot,
  artifactDirectoryPath,
  stagingDirectoryPath,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const paths = [root];
  for (const directoryPath of [artifactDirectoryPath, stagingDirectoryPath]) {
    const candidate = path.resolve(requireText(directoryPath, 'critical alert retry artifact directory'));
    const relative = path.relative(root, candidate);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('critical alert retry artifact path is outside the repository trust boundary');
    }
    let current = root;
    for (const segment of relative ? relative.split(path.sep) : []) {
      current = path.join(current, segment);
      paths.push(current);
    }
  }
  return [...new Set(paths)];
}

function snapshotExistingRetryArtifactDirectories(directoryPaths) {
  const identities = new Map();
  for (const directoryPath of directoryPaths) {
    let stat;
    try {
      stat = fs.lstatSync(directoryPath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw retryArtifactDirectoryError(error);
    }
    identities.set(directoryPath, retryArtifactDirectoryIdentityFromStat(stat));
  }
  return identities;
}

function captureRetryArtifactDirectoryIdentities({ directoryPaths, existingDirectoryIdentities }) {
  const identities = new Map();
  for (const directoryPath of directoryPaths) {
    let stat;
    try {
      stat = fs.lstatSync(directoryPath);
    } catch (error) {
      throw retryArtifactDirectoryError(error);
    }
    const current = retryArtifactDirectoryIdentityFromStat(stat);
    const existing = existingDirectoryIdentities.get(directoryPath);
    if (existing != null && !sameRetryArtifactDirectoryIdentity(existing, current)) {
      throw new Error('critical alert retry artifact directory identity changed or is unavailable');
    }
    identities.set(directoryPath, current);
  }
  return identities;
}

function retryArtifactDirectoryIdentityFromStat(stat) {
  if (!stat?.isDirectory?.() || stat.isSymbolicLink?.()) {
    throw new Error('critical alert retry artifact directory identity changed or is unavailable');
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

function sameRetryArtifactDirectoryIdentity(expected, current) {
  return expected.dev === current.dev && expected.ino === current.ino;
}

function syncRetryArtifactPublicationDirectories({
  repoRoot,
  artifactDirectoryPath,
  stagingDirectoryPath,
  publicationDirectoryIdentities,
  createdDirectoryPaths,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  assertRetryArtifactTrustBoundary({
    repoRoot: root,
    artifactDirectoryPath,
    stagingDirectoryPath,
  });
  const pathsToSync = new Set([artifactDirectoryPath]);
  for (const directoryPath of createdDirectoryPaths) {
    pathsToSync.add(directoryPath);
    if (directoryPath !== root) pathsToSync.add(path.dirname(directoryPath));
  }
  for (const directoryPath of [...pathsToSync].sort((left, right) => right.length - left.length)) {
    const expectedIdentity = publicationDirectoryIdentities.get(directoryPath);
    if (expectedIdentity == null) {
      throw new Error('critical alert retry artifact directory identity changed or is unavailable');
    }
    syncVerifiedRetryArtifactDirectory(directoryPath, expectedIdentity);
  }
}

function syncVerifiedRetryArtifactDirectory(directoryPath, expectedIdentity) {
  const directoryFd = openBoundRetryArtifactDirectory(directoryPath, { createMissing: false });
  try {
    const currentIdentity = fs.fstatSync(directoryFd);
    if (!sameRetryArtifactDirectoryIdentity(expectedIdentity, currentIdentity)) {
      throw new Error('critical alert retry artifact directory identity changed or is unavailable');
    }
    fs.fsyncSync(directoryFd);
  } catch (error) {
    throw retryArtifactDirectoryError(error);
  } finally {
    fs.closeSync(directoryFd);
  }
}

function openBoundRetryArtifactDirectory(directoryPath, { createMissing = true } = {}) {
  const filesystemRoot = path.parse(directoryPath).root;
  let directoryFd = openRetryArtifactDirectoryAtPath(filesystemRoot);
  try {
    for (const segment of path.relative(filesystemRoot, directoryPath).split(path.sep).filter(Boolean)) {
      const childPath = path.join(descriptorDirectoryPathFor(directoryFd), segment);
      let childFd;
      try {
        childFd = openRetryArtifactDirectoryAtPath(childPath);
      } catch (error) {
        if (error?.code !== 'ENOENT' || !createMissing) throw retryArtifactDirectoryError(error);
        try {
          fs.mkdirSync(childPath, { mode: 0o700 });
        } catch (mkdirError) {
          if (mkdirError?.code !== 'EEXIST') throw retryArtifactDirectoryError(mkdirError);
        }
        try {
          childFd = openRetryArtifactDirectoryAtPath(childPath);
        } catch (openError) {
          throw retryArtifactDirectoryError(openError);
        }
      }
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    throw error;
  }
}

function openRetryArtifactDirectoryAtPath(directoryPath) {
  return fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

function descriptorDirectoryPathFor(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function retryArtifactDirectoryError(error) {
  if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
    return new Error('critical alert retry artifact directory identity changed or is unavailable', { cause: error });
  }
  return error;
}

function assertRetryArtifactDirectoryIdentity(artifactPath, expectedIdentity, options = {}) {
  const currentFd = openBoundRetryArtifactDirectory(path.dirname(artifactPath), options);
  try {
    const currentIdentity = fs.fstatSync(currentFd);
    if (currentIdentity.dev !== expectedIdentity.dev || currentIdentity.ino !== expectedIdentity.ino) {
      throw new Error('critical alert retry artifact directory identity changed or is unavailable');
    }
  } catch (error) {
    throw retryArtifactDirectoryError(error);
  } finally {
    fs.closeSync(currentFd);
  }
}

function createRetryArtifactTemporaryFile({ descriptorDirectoryPath }) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | fs.constants.O_NOFOLLOW;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporaryPath = path.join(
      descriptorDirectoryPath,
      `.${CRITICAL_ALERT_RETRY_FILE}.${randomBytes(16).toString('hex')}.tmp`,
    );
    try {
      return {
        temporaryPath,
        temporaryFd: fs.openSync(temporaryPath, flags, 0o600),
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('unable to reserve a secure critical alert retry artifact temporary file');
}

function criticalAlertRetryArtifactRelativePath(domainId, runId) {
  return path.posix.join(
    CRITICAL_ALERT_RETRY_ROOT,
    domainId,
    runId,
    CRITICAL_ALERT_RETRY_FILE,
  );
}

function requireArtifactPathSegment(value, label) {
  const segment = requireText(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) {
    throw new Error(`${label} must be a safe path segment`);
  }
  return segment;
}

function criticalAlertDeliveryRetryError(error, { compensationStatus, alertDelivery }) {
  const detail = alertDelivery?.reason ?? 'alert_persistence_failed';
  const retryError = new Error(
    `${safeErrorMessage(error)}; CRITICAL alert delivery retry required (${detail})`,
    { cause: error },
  );
  retryError.code = 'CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED';
  retryError.compensationStatus = compensationStatus;
  retryError.alertDelivery = Object.freeze({
    status: 'retry_required',
    severity: alertDelivery?.severity ?? 'CRITICAL',
    dedupeKey: alertDelivery?.dedupeKey ?? null,
    reason: detail,
    retryArtifact: alertDelivery?.retryArtifact ?? null,
    ...(alertDelivery?.retryPersistenceStatus !== 'failed'
      ? {}
      : {
          retryPersistenceStatus: 'failed',
          retryPersistenceCode: 'critical_alert_retry_artifact_persistence_failed',
        }),
  });
  if (error?.compensation != null) retryError.compensation = error.compensation;
  return retryError;
}

export function serializeSupplementaryL1OperationFailure(error) {
  const code = safeStringProperty(error, 'code');
  const compensationStatus = safeStringProperty(error, 'compensationStatus');
  const alertDelivery = safeProperty(error, 'alertDelivery');
  return {
    schemaVersion: 1,
    status: 'failed',
    message: safeErrorMessage(error),
    code,
    compensationStatus,
    alertDelivery: serializeAlertDelivery(alertDelivery),
  };
}

function serializeAlertDelivery(value) {
  if (!value || typeof value !== 'object') return null;
  const status = safeStringProperty(value, 'status');
  const severity = safeStringProperty(value, 'severity');
  const dedupeKey = safeStringProperty(value, 'dedupeKey');
  const reason = safeStringProperty(value, 'reason');
  const retryPersistenceStatus = safeStringProperty(value, 'retryPersistenceStatus');
  const retryArtifactValue = safeProperty(value, 'retryArtifact');
  let retryArtifact = null;
  if (retryArtifactValue != null) {
    try {
      retryArtifact = normalizeRetryArtifact(retryArtifactValue);
    } catch {
      retryArtifact = null;
    }
  }
  return {
    status,
    severity,
    dedupeKey,
    reason,
    retryArtifact,
    ...(retryPersistenceStatus !== 'failed'
      ? {}
      : {
          retryPersistenceStatus: 'failed',
          retryPersistenceCode: 'critical_alert_retry_artifact_persistence_failed',
        }),
  };
}

/**
 * Error values cross the CLI boundary and may be arbitrary JavaScript values.
 * Property access and string coercion are both user-controlled operations for
 * proxies, throwing getters, Symbols, and null-prototype objects, so every
 * read is isolated and has a stable fallback.
 */
function safeProperty(value, key, fallback = undefined) {
  if (value == null) return fallback;
  try {
    return value[key];
  } catch {
    return fallback;
  }
}

function safeStringProperty(value, key, fallback = null) {
  const property = safeProperty(value, key, fallback);
  return typeof property === 'string' ? property : fallback;
}

function safeErrorMessage(value) {
  const message = safeStringProperty(value, 'message');
  if (message != null && message.trim()) return message;
  try {
    const coerced = String(value);
    return coerced && coerced !== '[object Object]' ? coerced : 'supplementary L1 operation failed';
  } catch {
    return 'supplementary L1 operation failed';
  }
}

export function assertImportSummaryHealthy(value) {
  const errors = [];
  collectImportErrors(value, '$', errors);
  if (errors.length > 0) {
    throw new Error(`import summary contains ${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`);
  }
}

/**
 * Resolve and validate the automatic L2 diff before any import DML is
 * allowed.  Producers may provide a read-only planner on the adapter; when
 * they do not, the frozen bundle must carry the exact diff evidence itself.
 */
export async function runAutomaticL2Gate({ adapter, current, bundle, executionTime } = {}) {
  if (bundle?.executionMode !== 'ACTIVATION_GATED_AUTO') return null;
  const diff = typeof adapter?.buildAutomaticL2Diff === 'function'
    ? await adapter.buildAutomaticL2Diff({ bundle, current, executionTime })
    : extractL2AutomaticDiff(bundle.importPlan);
  const policy = {
    ...bundle.policy,
    ...(current?.policyJson == null ? {} : { policyJson: current.policyJson }),
  };
  return assertL2AutomaticGate({
    policy,
    ownedTables: bundle.ownedTables,
    diff,
    now: executionTime,
  });
}

function collectImportErrors(value, location, errors) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectImportErrors(entry, `${location}[${index}]`, errors));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if ((key === 'errors' || key === 'failures') && Array.isArray(child)) {
      child.forEach((entry) => errors.push(`${childLocation}: ${String(entry)}`));
      continue;
    }
    collectImportErrors(child, childLocation, errors);
  }
}

export function createMysqlSupplementaryL1Adapter(connection, {
  bundlePath,
  progressPath = null,
  repoRoot = process.cwd(),
  environmentId = 'local',
  buildAutomaticL2DiffImpl = buildReadOnlyAutomaticL2Diff,
} = {}) {
  if (!connection) throw new TypeError('MySQL connection is required');
  const root = resolveCliRepositoryRoot(repoRoot);
  const frozenBundlePath = resolveCliArtifactPath(root, bundlePath, 'bundlePath');
  const frozenProgressPath = progressPath == null ? null : path.resolve(requireText(progressPath, 'progressPath'));
  const bundleBytes = readPrivateCliFileBytes(root, frozenBundlePath, 'bundlePath');
  let parsedBundle = null;
  try {
    parsedBundle = JSON.parse(bundleBytes.toString('utf8'));
  } catch {
    // The operation will report the normal bundle validation error later.  The
    // path boundary is still enforced before the adapter can consume bytes.
  }
  if (parsedBundle?.executionMode === 'ACTIVATION_GATED_AUTO') {
    assertCliBundleArtifact({
      repoRoot: root,
      inputPath: frozenBundlePath,
      bundle: parsedBundle,
    });
  }
  if (parsedBundle?.importPlan?.automaticAttemptIdentity != null) {
    assertBoundAutomaticProgress(root, frozenBundlePath, frozenProgressPath, parsedBundle);
    assertUnusedAutomaticReconciliationInputs(root, parsedBundle);
  }
  const bundleFileHash = sha256Bytes(bundleBytes);
  const state = { applyId: null, approvalId: null };
  return {
    repoRoot: root,
    bundlePath: frozenBundlePath,
    begin: () => connection.beginTransaction(),
    async readDatabaseTime({ authorizationContext } = {}) {
      if (!authorizationContext) throw new Error('automatic activation authorization context is required');
      const [rows] = await connection.query(
        'SELECT decision_identity AS decisionIdentity, packet_hash AS packetHash, policy_set_hash AS policySetHash,'
        + ' actor, reason, authorization_reference AS authorizationReference, authorized_at AS authorizedAt,'
        + ' expires_at AS expiresAt, CURRENT_TIMESTAMP AS databaseTime'
        + ' FROM crawler_automation_activation_decision'
        + ' WHERE decision_kind = ? AND domain_id = ? AND decision_identity = ?'
        + ' AND packet_hash = ? AND policy_set_hash = ?'
        + ' AND authorized_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP'
        + ' ORDER BY authorized_at DESC, id DESC LIMIT 1 FOR UPDATE',
        ['SCHEDULER_ACTIVATION', 'crawler_v2_scheduler', authorizationContext.activationDecisionIdentity,
          authorizationContext.activationPacketHash, authorizationContext.activationPolicySetHash],
      );
      return rows?.[0] ?? null;
    },
    async lockCurrentContext(bundle, executionTime) {
      const current = await readCurrentSupplementaryContext(connection, {
        bundle,
        environmentId,
        repoRoot: root,
        executionTime,
        lock: true,
        initializeGenerations: true,
      });
      state.baselineTables = current.tables;
      state.baselineGenerations = current.generations;
      return current;
    },
    async buildAutomaticL2Diff({ bundle, current, executionTime }) {
      return buildAutomaticL2DiffImpl({
        repoRoot: root,
        connection,
        bundle,
        current,
        executionTime,
      });
    },
    async persistRunChain(bundle, authorizationContext, automaticGate = null) {
      const expiresAt = toMysqlTimestamp(authorizationContext.expiresAt);
      const automatic = bundle.executionMode === 'ACTIVATION_GATED_AUTO';
      await connection.query(
        'INSERT INTO crawler_automation_run'
        + ' (run_id, primary_domain_id, covered_domains_json, policy_set_hash, trigger_kind,'
        + ' status, baseline_fingerprint, version) VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, ?, 0)',
        [bundle.runId, bundle.domainId, JSON.stringify([bundle.domainId]), bundle.policy.policySetHash,
          automatic ? 'SCHEDULER_AUTO_L2' : 'AUTHORIZED_L1', 'SNAPSHOT_READY', bundle.baselineFingerprint],
      );
      await connection.query(
        'INSERT INTO crawler_automation_run_policy'
        + ' (run_id, domain_id, policy_version, policy_hash, policy_set_hash) VALUES (?, ?, ?, ?, ?)',
        [bundle.runId, bundle.domainId, bundle.policy.policyVersion, bundle.policy.policyHash,
          bundle.policy.policySetHash],
      );
      await connection.query(
        'INSERT INTO crawler_automation_evidence'
        + ' (run_id, kind, private_path, sha256, size_bytes, schema_version, frozen_input,'
        + ' policy_set_hash, retention_until) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)',
        [bundle.runId, `${bundle.domainId.toUpperCase()}_FROZEN_BUNDLE`, frozenBundlePath,
          bundleFileHash, bundleBytes.length, bundle.policy.policySetHash, expiresAt],
      );
      await connection.query(
        'INSERT INTO crawler_automation_evidence_set'
        + ' (run_id, evidence_hash, manifest_json, policy_set_hash, baseline_fingerprint)'
        + ' VALUES (?, ?, CAST(? AS JSON), ?, ?)',
        [bundle.runId, bundle.evidenceHash, JSON.stringify({
          automaticSourceFingerprint: bundle.importPlan.automaticSourceFingerprint ?? null,
          sourceDispatchIdentity: bundle.sourceDispatchIdentity ?? null,
          bundleFileHash,
          privatePath: frozenBundlePath,
          source: bundle.source,
        }), bundle.policy.policySetHash, bundle.baselineFingerprint],
      );
      await connection.query(
        'INSERT INTO crawler_automation_apply_bundle'
        + ' (run_id, bundle_hash, policy_set_hash, evidence_hash, logical_diff_hash,'
        + ' baseline_fingerprint, planned_apply_action_id, schema_version, private_path,'
        + ' size_bytes, retention_until) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
        [bundle.runId, bundle.bundleHash, bundle.policy.policySetHash, bundle.evidenceHash,
          bundle.logicalDiffHash, bundle.baselineFingerprint, bundle.operationId,
          frozenBundlePath, bundleBytes.length, expiresAt],
      );
      await connection.query(
        'INSERT INTO crawler_automation_decision'
        + ' (run_id, decision, decision_hash, reason_codes_json, counts_ratios_json,'
        + ' gate_results_json, policy_set_hash, evidence_hash, bundle_hash, logical_diff_hash,'
        + ' logical_diff_identity_json, baseline_fingerprint, snapshot_required,'
        + ' planned_apply_action_id) VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON),'
        + ' CAST(? AS JSON), ?, ?, ?, ?, CAST(? AS JSON), ?, 1, ?)',
        [bundle.runId, automatic ? 'AUTO_APPLY_L2' : 'REQUIRES_OWNER_L1', bundle.decisionHash,
          JSON.stringify([automatic ? 'ACTIVATION_GATED_AUTOMATIC' : 'LEVEL_L1_REQUIRES_OWNER']),
          JSON.stringify(automaticGate?.counts ?? {}),
          JSON.stringify(automaticGate == null ? [true] : [automaticGate]),
          bundle.policy.policySetHash, bundle.evidenceHash, bundle.bundleHash,
          bundle.logicalDiffHash, JSON.stringify(bundle.logicalDiffIdentity),
          bundle.baselineFingerprint, bundle.operationId],
      );
      if (!automatic) {
        const [approval] = await connection.query(
        'INSERT INTO crawler_automation_approval'
        + ' (request_key, run_id, decision_hash, policy_set_hash, evidence_hash, bundle_hash,'
        + ' logical_diff_hash, logical_diff_identity_json, baseline_fingerprint,'
        + ' planned_apply_action_id, actor, action, reason, reauth_id, run_version, version,'
        + ' consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, 0, 0, NOW())',
        [authorizationContext.decisionIdentity, bundle.runId, bundle.decisionHash,
          bundle.policy.policySetHash, bundle.evidenceHash, bundle.bundleHash,
          bundle.logicalDiffHash, JSON.stringify(bundle.logicalDiffIdentity),
          bundle.baselineFingerprint, bundle.operationId, authorizationContext.actor,
          'APPROVE', authorizationContext.reason, authorizationContext.authorizationReference],
        );
        state.approvalId = Number(approval?.insertId);
        if (!Number.isSafeInteger(state.approvalId) || state.approvalId < 1) {
          throw new Error('supplementary L1 approval insert did not return an id');
        }
      }
      await connection.query(
        'INSERT INTO crawler_automation_snapshot'
        + ' (run_id, scope_descriptor_json, private_path, sha256, policy_set_hash,'
        + ' baseline_fingerprint, integrity_status, retention_until)'
        + ' VALUES (?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?)',
        [bundle.runId, JSON.stringify({ ownedTables: bundle.ownedTables }), frozenBundlePath,
          bundleFileHash, bundle.policy.policySetHash, bundle.baselineFingerprint, 'VERIFIED', expiresAt],
      );
      const [apply] = await connection.query(
        'INSERT INTO crawler_automation_apply'
        + ' (run_id, bundle_hash, policy_set_hash, decision_hash, approval_id, mode, status,'
        + ' before_generation_json, commit_protocol) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)',
        [bundle.runId, bundle.bundleHash, bundle.policy.policySetHash, bundle.decisionHash,
          state.approvalId, automatic ? 'AUTO_APPLY_L2' : 'APPROVED_OWNER_L1', 'APPLYING',
          JSON.stringify(bundle.baseline.generations), 'SINGLE_TXN'],
      );
      state.applyId = Number(apply?.insertId);
      if (!Number.isSafeInteger(state.applyId) || state.applyId < 1) {
        throw new Error('supplementary L1 apply insert did not return an id');
      }
      for (const generation of bundle.baseline.generations) {
        const fenceScope = resolveFenceScope(generation);
        await connection.query(
          'INSERT INTO crawler_automation_write_fence'
          + ' (environment_id, database_role, physical_table, field_group, logical_predicate_hash,'
          + ' latest_run_id, fence_token, before_generation, expires_at, version)'
          + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
          + ' ON DUPLICATE KEY UPDATE latest_run_id = VALUES(latest_run_id),'
          + ' fence_token = VALUES(fence_token), before_generation = VALUES(before_generation),'
          + ' committed_generation = NULL, commit_marker = NULL, expires_at = VALUES(expires_at),'
          + ' version = version + 1',
          [environmentId, generation.databaseRole, generation.table, fenceScope.fieldGroup, fenceScope.logicalPredicateHash,
            bundle.runId, hashJson({ runId: bundle.runId, ...fenceScope }),
            generation.generation, expiresAt],
        );
      }
    },
    applyFrozenImport: (_plan, bundle) => {
      if (bundle.importPlan?.automaticAttemptIdentity != null) {
        assertBoundAutomaticProgress(root, frozenBundlePath, frozenProgressPath, bundle);
        assertUnusedAutomaticReconciliationInputs(root, bundle);
      }
      return applyFrozenDomainImport({ connection, bundle, repoRoot: root });
    },
    async advanceMutationGenerations(bundle) {
      for (const generation of bundle.baseline.generations) {
        const [result] = await connection.query(
          'UPDATE crawler_automation_mutation_generation'
          + ' SET generation = generation + 1, last_writer_run_id = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND scope_key_hash = ? AND generation = ?',
          [bundle.runId, environmentId, generation.databaseRole, generation.table,
            generationScopeHash(generation), generation.generation],
        );
        if (Number(result?.affectedRows) !== 1) {
          throw new Error(`mutation generation fence was lost: ${generation.table}`);
      }
      const [fence] = await connection.query(
        'UPDATE crawler_automation_write_fence SET committed_generation = ?, commit_marker = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND field_group = ? AND logical_predicate_hash = ?'
          + ' AND latest_run_id = ? AND before_generation = ?',
          [generation.generation + 1, bundle.bundleHash.slice(7), environmentId,
            generation.databaseRole, generation.table,
            resolveFenceScope(generation).fieldGroup, resolveFenceScope(generation).logicalPredicateHash,
            bundle.runId, generation.generation],
        );
        if (Number(fence?.affectedRows) !== 1) throw new Error(`write fence was lost: ${generation.table}`);
      }
    },
    async persistCommittedApply({ bundle, importSummary, completedAt }) {
      const committed = bundle.baseline.generations.map((row) => ({ ...row, generation: row.generation + 1 }));
      const [apply] = await connection.query(
        'UPDATE crawler_automation_apply SET status = ?, committed_generation_json = CAST(? AS JSON),'
        + ' completed_at = ? WHERE id = ? AND status = ?',
        ['COMMITTED', JSON.stringify({ generations: committed, importSummary }),
          toMysqlTimestamp(completedAt), state.applyId, 'APPLYING'],
      );
      if (Number(apply?.affectedRows) !== 1) throw new Error('supplementary apply status fence was lost');
      const [run] = await connection.query(
        'UPDATE crawler_automation_run SET status = ?, completed_at = ?, version = version + 1'
        + ' WHERE run_id = ? AND status = ? AND version = 0',
        ['COMPLETED', toMysqlTimestamp(completedAt), bundle.runId, 'SNAPSHOT_READY'],
      );
      if (Number(run?.affectedRows) !== 1) throw new Error('supplementary run status fence was lost');
    },
    async persistReconciliationEvidence({ bundle, evidence, written }) {
      const [result] = await connection.query(
        'INSERT INTO crawler_automation_evidence'
        + ' (run_id, kind, private_path, sha256, size_bytes, schema_version, frozen_input,'
        + ' policy_set_hash, retention_until) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)'
        , [bundle.runId, 'FULL_RECONCILIATION', path.resolve(root, written.path), written.sha256,
          fs.statSync(path.resolve(root, written.path)).size,
          bundle.policy.policySetHash, toMysqlTimestamp(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())],
      );
      if (Number(result?.affectedRows) !== 1) {
        throw new Error('reconciliation evidence artifact was not persisted');
      }
    },
    async writeReconciliationInputs({ bundle, reconciliationInput, executionTime }) {
      const inputPaths = normalizeReconciliationInputPaths({
        root,
        bundle,
        reconciliationInput,
      });
      const sourceAbsolute = assertRepositoryOrdinaryFile({
        repoRoot: root,
        filePath: path.resolve(root, bundle.source.path),
        label: 'L1 bundle source',
      });
      const sourceBytes = fs.readFileSync(sourceAbsolute);
      const sourceSha256 = sha256Bytes(sourceBytes);
      if (sourceSha256 !== bundle.source.sha256) {
        throw new Error('frozen source hash drifted before reconciliation');
      }

      const progress = readOptionalRunProgress(root, frozenBundlePath, frozenProgressPath);
      if (!progress) {
        throw new Error('L1 source progress artifact is required for full reconciliation');
      }
      if (progress.status !== 'completed') {
        throw new Error('L1 source progress is not terminal');
      }
      assertAutomaticAttemptMatches(progress.payload, bundle.importPlan?.automaticAttemptIdentity, 'source progress');

      const generations = [];
      const tableRows = {};
      const writeFences = [];
      for (const expected of bundle.baseline.generations) {
        const fenceScope = resolveFenceScope(expected);
        const scopeHash = generationScopeHash(expected);
        const [generationRows] = await connection.query(
          'SELECT generation, last_writer_run_id AS lastWriterRunId'
          + ' FROM crawler_automation_mutation_generation'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND scope_key_hash = ? FOR UPDATE',
          [bundle.baseline.environmentId, expected.databaseRole, expected.table, scopeHash],
        );
        const generation = generationRows?.[0];
        const expectedGeneration = Number(expected.generation) + 1;
        if (Number(generation?.generation) !== expectedGeneration
            || generation?.lastWriterRunId !== bundle.runId) {
          throw new Error(`mutation generation readback does not belong to run: ${expected.table}`);
        }
        generations.push({ ...expected, generation: expectedGeneration, lastWriterRunId: bundle.runId });

        const [fenceRows] = await connection.query(
          'SELECT latest_run_id AS latestRunId, before_generation AS beforeGeneration,'
          + ' committed_generation AS committedGeneration, commit_marker AS commitMarker,'
          + ' expires_at AS expiresAt FROM crawler_automation_write_fence'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND field_group = ? AND logical_predicate_hash = ? FOR UPDATE',
          [bundle.baseline.environmentId, expected.databaseRole, expected.table,
            fenceScope.fieldGroup, fenceScope.logicalPredicateHash],
        );
        const fence = fenceRows?.[0];
        if (fence?.latestRunId !== bundle.runId
            || Number(fence.beforeGeneration) !== Number(expected.generation)
            || Number(fence.committedGeneration) !== expectedGeneration
            || fence.commitMarker !== bundle.bundleHash.slice(7)) {
          throw new Error(`write fence readback does not belong to run: ${expected.table}`);
        }
        writeFences.push({
          databaseRole: expected.databaseRole,
          table: expected.table,
          fieldGroup: fenceScope.fieldGroup,
          logicalPredicateHash: fenceScope.logicalPredicateHash,
          latestRunId: fence.latestRunId,
          beforeGeneration: Number(fence.beforeGeneration),
          committedGeneration: Number(fence.committedGeneration),
          commitMarker: fence.commitMarker,
          expiresAt: fence.expiresAt ?? null,
        });

        const [rows] = await connection.query(
          `SELECT * FROM \`${expected.table}\` ORDER BY \`id\` FOR UPDATE`,
        );
        tableRows[expected.table] = stableValue(rows ?? []);
      }

      const [attemptRows] = await connection.query(
        "SELECT COUNT(*) AS activeAttempts,"
        + " COALESCE(SUM(status IN ('OVERDUE', 'STALLED', 'TIMED_OUT')), 0) AS overdueAttempts"
        + ' FROM crawler_automation_run_attempt'
        + ' WHERE domain_id = ? AND status NOT IN (\'COMPLETED\', \'FAILED\', \'CANCELLED\', \'EXPIRED\')',
        [bundle.domainId],
      );
      const [reservationRows] = await connection.query(
        "SELECT COUNT(*) AS activeReservations,"
        + " COALESCE(SUM(status IN ('OVERDUE', 'STALLED', 'TIMED_OUT')), 0) AS overdueReservations"
        + ' FROM crawler_automation_attempt_reservation'
        + ' WHERE domain_id = ? AND status NOT IN (\'RELEASED\', \'CONSUMED\', \'EXPIRED\')',
        [bundle.domainId],
      );
      const activeAttemptCount = Number(attemptRows?.[0]?.activeAttempts ?? 0);
      const overdueAttemptCount = Number(attemptRows?.[0]?.overdueAttempts ?? 0);
      const activeReservationCount = Number(reservationRows?.[0]?.activeReservations ?? 0);
      const overdueReservationCount = Number(reservationRows?.[0]?.overdueReservations ?? 0);
      if (![activeAttemptCount, overdueAttemptCount, activeReservationCount, overdueReservationCount]
        .every((value) => Number.isSafeInteger(value) && value >= 0)) {
        throw new Error('attempt or reservation state readback is invalid');
      }
      if (activeAttemptCount !== 0 || overdueAttemptCount !== 0
          || activeReservationCount !== 0 || overdueReservationCount !== 0) {
        throw new Error('active or overdue L1 attempt/reservation work remains');
      }

      const sourceCoverage = {
        schemaVersion: 1,
        artifactKind: 'l1-source-coverage',
        ...(bundle.importPlan?.automaticAttemptIdentity == null ? {} : { automaticAttemptIdentity: bundle.importPlan.automaticAttemptIdentity }),
        domainId: bundle.domainId,
        runId: bundle.runId,
        sourcePath: bundle.source.path,
        sourceSha256,
        sourceByteLength: sourceBytes.length,
        progressPath: progress?.path ?? null,
        completeSourceCoverage: true,
        terminalProgress: true,
        unclassifiedCount: 0,
        ...(bundle.sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity: bundle.sourceDispatchIdentity }),
        generatedAt: executionTime,
      };
      const ownedTableReadback = {
        schemaVersion: 1,
        artifactKind: 'l1-owned-table-readback',
        ...(bundle.importPlan?.automaticAttemptIdentity == null ? {} : { automaticAttemptIdentity: bundle.importPlan.automaticAttemptIdentity }),
        domainId: bundle.domainId,
        runId: bundle.runId,
        ownedTables: bundle.ownedTables,
        generations,
        writeFences,
        tables: tableRows,
        generationReadback: true,
        unauthorizedMutationCount: 0,
        unclassifiedMutationCount: 0,
        ...(bundle.sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity: bundle.sourceDispatchIdentity }),
        generatedAt: executionTime,
      };
      const attemptState = {
        schemaVersion: 1,
        artifactKind: 'l1-attempt-state',
        ...(bundle.importPlan?.automaticAttemptIdentity == null ? {} : { automaticAttemptIdentity: bundle.importPlan.automaticAttemptIdentity }),
        domainId: bundle.domainId,
        runId: bundle.runId,
        activeAttemptCount,
        overdueAttemptCount,
        activeReservationCount,
        overdueReservationCount,
        ...(bundle.sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity: bundle.sourceDispatchIdentity }),
        generatedAt: executionTime,
      };

      writeReconciliationInputArtifact(inputPaths.sourceCoveragePath, sourceCoverage, root);
      writeReconciliationInputArtifact(inputPaths.ownedTableReadbackPath, ownedTableReadback, root);
      writeReconciliationInputArtifact(inputPaths.attemptStatePath, attemptState, root);
      return Object.freeze({ sourceCoverage, ownedTableReadback, attemptState });
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    postCommitVerify: ({ bundle }) => verifyCommittedSupplementaryOperation(connection, bundle),
    compensate: ({ bundle }) => compensateCommittedSupplementaryOperation(connection, bundle, state),
    markCompensationFailed: ({ bundle }) => markCompensationFailed(connection, bundle),
    recordAlert: ({ bundle, runId = bundle.runId, severity, dedupeKey, details }) => recordAutomationAlert(connection, {
      runId,
      severity,
      dedupeKey,
      details,
    }),
    persistCriticalAlertRetry: ({ retry }) => persistCriticalAlertRetryArtifact({
      repoRoot: root,
      retry,
    }),
  };
}

export async function readCurrentSupplementaryContext(connection, {
  bundle,
  environmentId = 'local',
  repoRoot = process.cwd(),
  lock = false,
  initializeGenerations = false,
} = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [ownerRows] = await connection.query(
    `SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1${suffix}`,
  );
  const [policyRows] = await connection.query(
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
    + ' pv.policy_hash AS policyHash, p.current_level AS currentLevel,'
    + ' p.operational_state AS operationalState, pv.policy_json AS policyJson FROM crawler_automation_policy p'
    + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
    + ` AND pv.policy_version = p.current_version ORDER BY p.domain_id${suffix}`,
  );
  const policy = (policyRows ?? []).find((row) => row.domainId === bundle.domainId);
  if (!policy) throw new Error(`current ${bundle.domainId} policy is missing`);
  const policyJson = parsePolicyJson(policy.policyJson);
  const ownedTables = resolveCurrentOwnedTables({
    bundle,
    policy,
    policyJson,
  });
  const policySetHash = computePolicySetHash((policyRows ?? []).map((row) => ({
    domainId: row.domainId,
    policyVersion: Number(row.policyVersion),
    policyHash: row.policyHash,
  })));
  const generations = [];
  for (const scope of ownedTables) {
    if (initializeGenerations) {
      await connection.query(
        'INSERT IGNORE INTO crawler_automation_mutation_generation'
        + ' (environment_id, database_role, physical_table, scope_key_hash, generation, schema_hash)'
        + ' VALUES (?, ?, ?, ?, 0, ?)',
        [environmentId, scope.databaseRole, scope.table, generationScopeHash(scope),
          hashJson({ schemaVersion: 1, databaseRole: scope.databaseRole, table: scope.table })],
      );
    }
    const [rows] = await connection.query(
      'SELECT generation FROM crawler_automation_mutation_generation'
      + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
      + ` AND scope_key_hash = ?${suffix}`,
      [environmentId, scope.databaseRole, scope.table, generationScopeHash(scope)],
    );
    generations.push({ ...scope, generation: Number(rows?.[0]?.generation ?? 0) });
  }
  const tables = {};
  for (const scope of ownedTables) {
    const [rows] = await connection.query(`SELECT * FROM \`${scope.table}\` ORDER BY \`id\`${suffix}`);
    tables[scope.table] = rows ?? [];
  }
  const dependencyTables = await readCurrentDependencyTables(connection, {
    domainId: bundle.domainId,
    repoRoot,
    suffix,
  });
  const baseline = {
    environmentId,
    generations,
    projectionHash: hashJson(tables),
    ...(dependencyTables == null ? {} : { dependencyTables }),
  };
  const [activationRows] = await connection.query(
    'SELECT decision_identity AS activationDecisionIdentity, packet_hash AS activationPacketHash,'
    + ' policy_set_hash AS activationPolicySetHash, authorized_at AS activationAuthorizedAt,'
    + ' expires_at AS activationExpiresAt'
    + ' FROM crawler_automation_activation_decision'
    + ' WHERE decision_kind = ? AND domain_id = ?'
    + ' ORDER BY authorized_at DESC, id DESC LIMIT 1',
    ['SCHEDULER_ACTIVATION', 'crawler_v2_scheduler'],
  );
  const activation = activationRows?.[0] ?? null;
  return {
    ownerUsername: ownerRows?.[0]?.username ?? null,
    ownerStatus: ownerRows?.[0]?.status ?? null,
    domainId: policy.domainId,
    policyVersion: Number(policy.policyVersion),
    policyHash: policy.policyHash,
    policySetHash,
    currentLevel: policy.currentLevel,
    operationalState: policy.operationalState,
    policyJson,
    ownedTables,
    baselineFingerprint: hashJson(baseline),
    approvalMode: policy.currentLevel === 'L2' ? 'AUTO_APPLY_ACTIVATED' : 'APPROVED_OWNER_L1',
    executionMode: bundle.executionMode ?? (policy.currentLevel === 'L2' ? 'ACTIVATION_GATED_AUTO' : 'MANUAL_OWNER_L1'),
    approvalConsumed: false,
    baseline,
    tables,
    ...(dependencyTables == null ? {} : { dependencyTables }),
    activationDecisionIdentity: activation?.activationDecisionIdentity ?? null,
    activationPacketHash: activation?.activationPacketHash ?? null,
    activationPolicySetHash: activation?.activationPolicySetHash ?? null,
    activationAuthorizedAt: activation?.activationAuthorizedAt ?? null,
    activationExpiresAt: activation?.activationExpiresAt ?? null,
  };
}

async function readCurrentDependencyTables(connection, { domainId, repoRoot, suffix }) {
  const dependencyTables = {};
  const needsItems = new Set(['items', 'npcs', 'armor_sets', 'buffs', 'audio']).has(domainId);
  const needsNpcs = new Set(['bosses', 'audio']).has(domainId);
  const needsCategories = new Set(['items', 'npcs']).has(domainId);
  if (needsItems) {
    const [rows] = await connection.query(
      'SELECT id, internal_name, name, name_zh, image, category_id, description,'
      + ' damage, defense, knockback, use_time, width, height, buy, sell, tooltip,'
      + ' rarity_id, game_period_id, game_model_id, is_stackable, stack_size, status, deleted'
      + ' FROM `items` WHERE deleted = 0'
        + suffix,
    );
    dependencyTables.items = rows ?? [];
  }
  if (needsNpcs) {
    const [rows] = await connection.query(
      'SELECT id, game_id, internal_name, name, name_zh, is_boss, raw_json FROM `npcs` WHERE deleted = 0'
      + suffix,
    );
    dependencyTables.npcs = rows ?? [];
  }
  if (needsCategories) {
    const [rows] = await connection.query(
      'SELECT id, code FROM `category` WHERE deleted = 0'
      + suffix,
    );
    dependencyTables.categories = rows ?? [];
  }
  if (domainId === 'npcs') {
    dependencyTables.npcZhMap = loadCurrentNpcZhRows(repoRoot);
  }
  if (domainId === 'audio') {
    dependencyTables.audioBgmDisplayNames = loadCurrentBgmDisplayNameRows(repoRoot);
  }
  return Object.keys(dependencyTables).length > 0 ? dependencyTables : null;
}

function loadCurrentNpcZhRows(repoRoot) {
  const mapPath = path.join(path.resolve(repoRoot), 'data', 'generated', 'npc-id-row-images.json');
  if (!fs.existsSync(mapPath)) return [];
  const stat = fs.lstatSync(mapPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('NPC zh dependency must be an ordinary file');
  const payload = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  return Array.isArray(payload?.records)
    ? payload.records.map((record) => ({
        internalName: record?.internalName ?? null,
        nameZh: record?.nameZh ?? null,
        subNameZh: record?.subNameZh ?? null,
      }))
    : [];
}

function loadCurrentBgmDisplayNameRows(repoRoot) {
  const displayNamePath = path.join(path.resolve(repoRoot), 'data', 'generated', 'audio-bgm-display-names.latest.json');
  if (fs.existsSync(displayNamePath)) {
    const stat = fs.lstatSync(displayNamePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('audio BGM display-name dependency must be an ordinary file');
    }
  }
  return loadLocalBgmDisplayNameRows({ displayNamePath });
}

async function verifyCommittedSupplementaryOperation(connection, bundle, { lock = false } = {}) {
  for (const expected of bundle.baseline.generations) {
    const [rows] = await connection.query(
      'SELECT generation, last_writer_run_id AS lastWriterRunId'
      + ' FROM crawler_automation_mutation_generation'
      + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
      + ' AND scope_key_hash = ?'
      + (lock ? ' FOR UPDATE' : ''),
      [bundle.baseline.environmentId, expected.databaseRole, expected.table, generationScopeHash(expected)],
    );
    const row = rows?.[0];
    if (Number(row?.generation) !== Number(expected.generation) + 1
        || row?.lastWriterRunId !== bundle.runId) {
      throw new Error(`post-commit generation readback failed: ${expected.table}`);
    }
  }
  return Object.freeze({ verified: true });
}

/**
 * Restore only rows that differ from the run's locked baseline. Generation and
 * writer fences are checked first so a later governed writer can never be
 * overwritten by compensation from an older run.
 */
async function compensateCommittedSupplementaryOperation(connection, bundle, state) {
  assertWholeTableSnapshotCompensationScopes(bundle?.ownedTables);
  if (!state?.baselineTables || typeof state.baselineTables !== 'object') {
    throw new Error('automatic compensation requires a locked table snapshot');
  }
  await connection.beginTransaction();
  try {
    await verifyCommittedSupplementaryOperation(connection, bundle, { lock: true });
    const restoredTables = [];
    for (const scope of [...bundle.ownedTables].reverse()) {
      await restoreTableSnapshot(connection, scope.table, state.baselineTables[scope.table]);
      restoredTables.push(scope.table);
    }
    for (const expected of bundle.baseline.generations) {
      const fenceScope = resolveFenceScope(expected);
      const [generationResult] = await connection.query(
        'UPDATE crawler_automation_mutation_generation SET generation = ?, last_writer_run_id = NULL'
        + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
        + ' AND scope_key_hash = ? AND generation = ? AND last_writer_run_id = ?',
        [expected.generation, bundle.baseline.environmentId, expected.databaseRole, expected.table,
          generationScopeHash(expected), Number(expected.generation) + 1, bundle.runId],
      );
      if (Number(generationResult?.affectedRows) !== 1) {
        throw new Error(`compensation generation fence was lost: ${expected.table}`);
      }
      const [fenceResult] = await connection.query(
        'UPDATE crawler_automation_write_fence SET committed_generation = NULL, commit_marker = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND field_group = ? AND logical_predicate_hash = ? AND latest_run_id = ?',
        ['COMPENSATED', bundle.baseline.environmentId, expected.databaseRole, expected.table,
          fenceScope.fieldGroup, fenceScope.logicalPredicateHash, bundle.runId],
      );
      if (Number(fenceResult?.affectedRows) !== 1) {
        throw new Error(`compensation write fence transition was not persisted: ${expected.table}`);
      }
    }
    const [applyResult] = await connection.query(
      'UPDATE crawler_automation_apply SET status = ?, completed_at = NOW()'
        + ' WHERE run_id = ? AND bundle_hash = ? AND status = ?',
      ['COMPENSATED', bundle.runId, bundle.bundleHash, 'COMMITTED'],
    );
    if (Number(applyResult?.affectedRows) !== 1) {
      throw new Error('compensation apply transition was not persisted');
    }
    const [runResult] = await connection.query(
      'UPDATE crawler_automation_run SET status = ?, version = version + 1'
        + ' WHERE run_id = ? AND status = ?',
      ['ROLLED_BACK', bundle.runId, 'COMPLETED'],
    );
    if (Number(runResult?.affectedRows) !== 1) {
      throw new Error('compensation run transition was not persisted');
    }

    const writeFenceReadback = [];
    for (const expected of bundle.baseline.generations) {
      const fenceScope = resolveFenceScope(expected);
      const [fenceRows] = await connection.query(
        'SELECT latest_run_id AS latestRunId, before_generation AS beforeGeneration,'
          + ' committed_generation AS committedGeneration, commit_marker AS commitMarker'
          + ' FROM crawler_automation_write_fence'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND field_group = ? AND logical_predicate_hash = ? FOR UPDATE',
        [bundle.baseline.environmentId, expected.databaseRole, expected.table,
          fenceScope.fieldGroup, fenceScope.logicalPredicateHash],
      );
      const fence = fenceRows?.[0];
      if (!fence || fenceRows.length !== 1
          || fence.latestRunId !== bundle.runId
          || Number(fence.beforeGeneration) !== Number(expected.generation)
          || fence.committedGeneration != null
          || fence.commitMarker !== 'COMPENSATED') {
        throw new Error(`compensation write fence readback was not persisted: ${expected.table}`);
      }
      writeFenceReadback.push(Object.freeze({
        table: expected.table,
        latestRunId: fence.latestRunId,
        beforeGeneration: Number(fence.beforeGeneration),
        committedGeneration: fence.committedGeneration == null ? null : Number(fence.committedGeneration),
        commitMarker: fence.commitMarker,
      }));
    }
    const [applyRows] = await connection.query(
      'SELECT run_id AS runId, bundle_hash AS bundleHash, status FROM crawler_automation_apply'
        + ' WHERE run_id = ? AND bundle_hash = ? FOR UPDATE',
      [bundle.runId, bundle.bundleHash],
    );
    const applyReadback = applyRows?.[0];
    if (!applyReadback || applyRows.length !== 1
        || applyReadback.runId !== bundle.runId
        || applyReadback.bundleHash !== bundle.bundleHash
        || applyReadback.status !== 'COMPENSATED') {
      throw new Error('compensation apply readback was not persisted');
    }
    const [runRows] = await connection.query(
      'SELECT run_id AS runId, status FROM crawler_automation_run WHERE run_id = ? FOR UPDATE',
      [bundle.runId],
    );
    const runReadback = runRows?.[0];
    if (!runReadback || runRows.length !== 1
        || runReadback.runId !== bundle.runId
        || runReadback.status !== 'ROLLED_BACK') {
      throw new Error('compensation run readback was not persisted');
    }
    await connection.commit();
    return Object.freeze({
      status: 'compensated',
      restoredTables: restoredTables.reverse(),
      readback: Object.freeze({
        writeFences: Object.freeze(writeFenceReadback),
        apply: Object.freeze({
          runId: applyReadback.runId,
          bundleHash: applyReadback.bundleHash,
          status: applyReadback.status,
        }),
        run: Object.freeze({
          runId: runReadback.runId,
          status: runReadback.status,
        }),
      }),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      appendSuppressed(error, rollbackError);
    }
    throw error;
  }
}

/**
 * The available snapshot restorer operates on a whole physical table. It must
 * never infer a row predicate from a logical predicate hash, because doing so
 * could overwrite data owned by another governed scope on the same table.
 */
function assertWholeTableSnapshotCompensationScopes(ownedTables) {
  if (!Array.isArray(ownedTables) || ownedTables.length === 0) {
    throw new Error('automatic compensation requires a scoped snapshot restorer because owned table scopes are unavailable');
  }
  for (const scope of ownedTables) {
    const fieldGroup = scope?.fieldGroup ?? 'all_columns';
    if (fieldGroup !== 'all_columns' || scope?.logicalPredicateHash != null) {
      const scopeLabel = `${scope?.databaseRole ?? 'unknown'}.${scope?.table ?? 'unknown'}`;
      throw new Error(
        `automatic compensation requires a scoped snapshot restorer for ${scopeLabel}; `
        + 'whole-table restoration supports only fieldGroup all_columns without logicalPredicateHash',
      );
    }
  }
}

async function markCompensationFailed(connection, bundle) {
  await connection.beginTransaction();
  try {
    const [apply] = await connection.query(
      'UPDATE crawler_automation_apply SET status = ?, completed_at = NOW()'
        + ' WHERE run_id = ? AND bundle_hash = ?'
        + ' AND status IN (?, ?, ?)',
      ['COMPENSATION_FAILED', bundle.runId, bundle.bundleHash, 'COMMITTED', 'POST_VERIFY_FAILED', 'COMPENSATING'],
    );
    if (Number(apply?.affectedRows) !== 1) {
      throw new Error('compensation apply status transition was not persisted');
    }
    const [run] = await connection.query(
      'UPDATE crawler_automation_run SET status = ?, version = version + 1'
        + ' WHERE run_id = ? AND status IN (?, ?) ',
      ['COMPENSATION_FAILED', bundle.runId, 'COMPLETED', 'ROLLED_BACK'],
    );
    if (Number(run?.affectedRows) !== 1) {
      throw new Error('compensation run status transition was not persisted');
    }
    const [applyRows] = await connection.query(
      'SELECT run_id AS runId, bundle_hash AS bundleHash, status FROM crawler_automation_apply'
        + ' WHERE run_id = ? AND bundle_hash = ? FOR UPDATE',
      [bundle.runId, bundle.bundleHash],
    );
    const applyReadback = applyRows?.[0];
    if (!applyReadback || applyRows.length !== 1
        || applyReadback.runId !== bundle.runId
        || applyReadback.bundleHash !== bundle.bundleHash
        || applyReadback.status !== 'COMPENSATION_FAILED') {
      throw new Error('compensation apply status readback was not persisted');
    }
    const [runRows] = await connection.query(
      'SELECT run_id AS runId, status FROM crawler_automation_run WHERE run_id = ? FOR UPDATE',
      [bundle.runId],
    );
    const runReadback = runRows?.[0];
    if (!runReadback || runRows.length !== 1
        || runReadback.runId !== bundle.runId
        || runReadback.status !== 'COMPENSATION_FAILED') {
      throw new Error('compensation run status readback was not persisted');
    }
    await connection.commit();
    return Object.freeze({
      status: 'COMPENSATION_FAILED',
      applyAffectedRows: 1,
      runAffectedRows: 1,
      readback: Object.freeze({
        apply: Object.freeze({
          runId: applyReadback.runId,
          bundleHash: applyReadback.bundleHash,
          status: applyReadback.status,
        }),
        run: Object.freeze({
          runId: runReadback.runId,
          status: runReadback.status,
        }),
      }),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      appendSuppressed(error, rollbackError);
    }
    throw error;
  }
}

async function restoreTableSnapshot(connection, table, baselineRows) {
  if (!Array.isArray(baselineRows)) {
    throw new Error(`automatic compensation baseline is missing for ${table}`);
  }
  const quotedTable = quoteIdentifier(table);
  const [currentRows] = await connection.query(`SELECT * FROM ${quotedTable} ORDER BY \`id\` FOR UPDATE`);
  const baselineById = new Map(baselineRows.map((row) => [String(row?.id), row]));
  for (const row of currentRows ?? []) {
    if (!baselineById.has(String(row?.id))) {
      await connection.query(`DELETE FROM ${quotedTable} WHERE \`id\` = ?`, [row.id]);
    }
  }
  for (const row of baselineRows) {
    if (!row || row.id == null) throw new Error(`automatic compensation row id is missing for ${table}`);
    const columns = Object.keys(row);
    const quotedColumns = columns.map(quoteIdentifier).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'id')
      .map((column) => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`)
      .join(', ');
    const sql = updates
      ? `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`
      : `INSERT IGNORE INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`;
    await connection.query(sql, columns.map((column) => row[column]));
  }
}

function quoteIdentifier(value) {
  const identifier = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error(`unsafe compensation identifier: ${identifier}`);
  return `\`${identifier}\``;
}

async function recordAutomationAlert(connection, { runId, severity, dedupeKey, details }) {
  const normalizedSeverity = ['INFO', 'WARNING', 'CRITICAL'].includes(String(severity ?? '').toUpperCase())
    ? String(severity).toUpperCase()
    : 'CRITICAL';
  await connection.query(
    'INSERT INTO crawler_automation_alert'
      + ' (run_id, severity, dedupe_key, status, details_json, first_seen_at, last_seen_at)'
      + ' VALUES (?, ?, ?, \'OPEN\', CAST(? AS JSON), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
      + ' ON DUPLICATE KEY UPDATE run_id = VALUES(run_id), severity = VALUES(severity),'
      + ' status = \'OPEN\', details_json = VALUES(details_json), last_seen_at = CURRENT_TIMESTAMP,'
      + ' acknowledged_by = NULL, acknowledged_at = NULL',
    [runId ?? null, normalizedSeverity, String(dedupeKey), JSON.stringify(details ?? {})],
  );
}

function appendSuppressed(error, suppressed) {
  if (!error || !suppressed || (typeof error !== 'object' && typeof error !== 'function')) return;
  try {
    if (typeof error.addSuppressed === 'function') {
      error.addSuppressed(suppressed);
      return;
    }
    if (!Array.isArray(error.suppressed)) error.suppressed = [];
    error.suppressed.push(suppressed);
  } catch {
    // Suppression metadata must not replace the original recovery failure.
  }
}

function toWritableRecoveryError(value) {
  let message = 'supplementary L1 operation failed';
  try {
    if (typeof value?.message === 'string') {
      message = value.message;
    } else {
      message = String(value);
    }
  } catch {
    // Preserve a stable failure boundary even for hostile thrown values.
  }
  return new Error(message, { cause: value });
}

function assertShimmerImporterWriteScope(bundle) {
  if (bundle?.domainId !== 'shimmer') return;
  // The importer also upserts shared context and source lineage. A four-table
  // transform scope cannot fence, reconcile, or compensate those writes.
  const writeTables = [
    'world_contexts',
    'entity_source_snapshots',
    'shimmer_item_transforms',
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_npc_transforms',
  ];
  const ownedTables = Array.isArray(bundle.ownedTables) ? bundle.ownedTables : [];
  const hasAllImporterTables = writeTables.every((table) => ownedTables.some((scope) => scope?.table === table));
  if (hasAllImporterTables) {
    throw new Error('Shimmer importer cross-owner partition contract requires a registered partition executor before apply');
  }
  const uncovered = writeTables.filter((table) => !ownedTables.some((scope) => (
    scope?.databaseRole === 'local'
    && scope.table === table
    && (scope.fieldGroup ?? 'all_columns') === 'all_columns'
    && scope.logicalPredicateHash == null
  )));
  if (uncovered.length > 0) {
    throw new Error(
      `Shimmer importer write scope is not covered by ownedTables: ${uncovered.map((table) => `local.${table}`).join(', ')}`,
    );
  }
}

export async function applyFrozenDomainImport({ connection, bundle, repoRoot }, {
  runBaseItemsImportImpl = runBaseItemsImport,
  runIndependentEntityImportImpl = runIndependentEntityImport,
  runAudioAssetImportImpl = runAudioAssetImport,
  runBossImportImpl = runBossImport,
} = {}) {
  assertShimmerImporterWriteScope(bundle);
  const sourcePath = path.resolve(repoRoot, bundle.source.path);
  const sourceBytes = fs.readFileSync(sourcePath);
  if (sha256Bytes(sourceBytes) !== bundle.source.sha256) throw new Error('frozen source hash drifted before apply');
  const sourcePayload = JSON.parse(sourceBytes.toString('utf8'));
  const dependencyTables = bundle?.baseline?.dependencyTables
    && typeof bundle.baseline.dependencyTables === 'object'
    && !Array.isArray(bundle.baseline.dependencyTables)
    ? bundle.baseline.dependencyTables
    : {};
  const requiresFrozenDependencies = bundle?.executionMode === 'ACTIVATION_GATED_AUTO'
    || bundle?.approvalMode === 'AUTO_APPLY_ACTIVATED'
    || Object.keys(dependencyTables).length > 0;
  const frozenDependency = (name) => {
    if (!requiresFrozenDependencies && !Object.hasOwn(dependencyTables, name)) return null;
    if (!Array.isArray(dependencyTables[name])) {
      throw new Error(`frozen ${bundle.domainId} apply requires a locked ${name} dependency snapshot`);
    }
    return dependencyTables[name];
  };
  if (bundle.domainId === 'items') {
    const itemDataset = sourcePayload?.datasets?.items;
    if (itemDataset?.entity !== 'items' || !Array.isArray(itemDataset.records)) {
      throw new Error('frozen items source is missing the exact Items dataset');
    }
    return runBaseItemsImportImpl({
      connection,
      records: itemDataset.records,
      ...(frozenDependency('categories') == null ? {} : { categoryRows: frozenDependency('categories') }),
      ...(frozenDependency('items') == null ? {} : { existingRows: frozenDependency('items') }),
    });
  }
  if (['npcs', 'buffs', 'projectiles', 'armor_sets'].includes(bundle.domainId)) {
    const domainDataset = sourcePayload?.datasets?.[bundle.domainId];
    const itemDataset = sourcePayload?.datasets?.items;
    if (domainDataset?.entity !== bundle.domainId || !Array.isArray(domainDataset.records)
        || itemDataset?.entity !== 'items' || !Array.isArray(itemDataset.records)) {
      throw new Error(`frozen ${bundle.domainId} source is missing exact domain and Item dependency datasets`);
    }
    const importerDependencies = {
      connection,
      transactionOwner: 'caller',
      datasets: sourcePayload.datasets,
    };
    if (['npcs', 'buffs', 'armor_sets'].includes(bundle.domainId)) {
      const itemRows = frozenDependency('items');
      if (itemRows != null) importerDependencies.itemRows = itemRows;
    }
    if (bundle.domainId === 'npcs') {
      const categoryRows = frozenDependency('categories');
      if (categoryRows != null) importerDependencies.categoryRows = categoryRows;
      const npcZhRows = frozenDependency('npcZhMap');
      if (npcZhRows != null) importerDependencies.npcZhRows = npcZhRows;
    }
    return runIndependentEntityImportImpl({ apply: 'true', entity: bundle.domainId }, importerDependencies);
  }
  if (bundle.domainId === 'audio') {
    const itemRows = frozenDependency('items');
    const npcRows = frozenDependency('npcs');
    const localBgmDisplayNameRows = frozenDependency('audioBgmDisplayNames');
    return runAudioAssetImportImpl({
      apply: true,
      inputJsonPath: sourcePath,
      reportPath: null,
      db: { database: 'terria_v1_local' },
    }, {
      connection,
      transactionOwner: 'caller',
      ...(itemRows == null ? {} : { itemRows }),
      ...(npcRows == null ? {} : { npcRows }),
      ...(localBgmDisplayNameRows == null ? {} : { localBgmDisplayNameRows }),
    });
  }
  if (bundle.domainId === 'bosses') {
    const npcRows = frozenDependency('npcs');
    return runBossImportImpl({
      input: sourcePath,
      'write-report': 'false',
      offline: 'true',
      strict: 'false',
      database: 'terria_v1_local',
    }, {
      connection,
      transactionOwner: 'caller',
      // Automatic Boss applies are offline and must not read or mutate the
      // mutable workspace NPC-map artifact. Member identities come only from
      // the bundle-frozen dependency snapshot.
      generatedNpcMap: null,
      ...(npcRows == null ? {} : { npcRows }),
    });
  }
  const shimmerBundle = loadFrozenShimmerImportBundle({ repoRoot, frozenSource: sourcePayload });
  const existing = await loadCurrentShimmerScope(connection, shimmerBundle, { forUpdate: true });
  const target = await loadTargetFingerprint(connection, {
    host: connection.config?.host ?? '127.0.0.1',
    port: Number(connection.config?.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    database: connection.config?.database ?? 'terria_v1_local',
  });
  const preview = buildShimmerImportPreview({ bundle: shimmerBundle, existing, target });
  if (bundle.importPlan.previewSha256 !== preview.previewSha256) {
    throw new Error('frozen shimmer preview drifted before apply');
  }
  await applyShimmerBundleChanges({ bundle: shimmerBundle, connection });
  const after = await loadCurrentShimmerScope(connection, shimmerBundle);
  assertShimmerImportScopeMatchesPreview({ after, preview });
  return preview.summary;
}

export function loadFrozenShimmerImportBundle({ repoRoot, frozenSource }, {
  loadBundleImpl = loadVerifiedShimmerImportBundle,
} = {}) {
  const bundle = loadBundleImpl({
    bundleManifestPath: requireText(frozenSource?.manifestPath, 'frozen Shimmer manifest path'),
    repoRoot,
  });
  if (bundle.generationId !== frozenSource?.generationId
      || bundle.manifestSha256 !== frozenSource?.manifestSha256
      || bundle.dataBundleSha256 !== frozenSource?.dataBundleSha256) {
    throw new Error('frozen Shimmer source does not match the verified generation');
  }
  return bundle;
}

export async function runSupplementaryL1OperationCli({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date().toISOString(),
  mysqlModule = null,
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
} = {}) {
  const args = parseArgs(argv);
  if (args.apply !== 'true') throw new Error('--apply=true is required');
  const repoRoot = resolveCliRepositoryRoot(env.WORKTREE_ROOT ?? process.cwd());
  const inputPath = resolveCliArtifactPath(repoRoot, args.input, '--input');
  const outputPath = resolveCliArtifactPath(repoRoot, args.output, '--output');
  const operationId = requireText(args['operation-id'], '--operation-id');
  const bundleBytes = readPrivateCliFileBytes(repoRoot, inputPath, '--input');
  let bundle;
  try {
    bundle = JSON.parse(bundleBytes.toString('utf8'));
  } catch (error) {
    throw new Error('--input bundle must be valid JSON', { cause: error });
  }
  if (bundle.operationId !== operationId) throw new Error('--operation-id must match the bundle');
  validateSupplementaryL1Bundle(bundle);
  assertCliBundleArtifact({ repoRoot, inputPath, bundle });
  assertCliResultOutputPath({ repoRoot, inputPath, outputPath, bundle });
  const authorizationContext = loadAuthorizationContextImpl({ env, operationId, now });
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  try {
    const result = await executeSupplementaryL1Operation({
        adapter: createMysqlSupplementaryL1Adapter(connection, {
          bundlePath: inputPath,
          progressPath: args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH,
          repoRoot,
        }),
      bundle,
      authorizationContext,
      now,
    });
    writeJsonAtomic(outputPath, result, { repoRoot });
    return result;
  } finally {
    await connection.end();
  }
}

/**
 * Resolve and bind the CLI's repository artifact boundary.  The operation CLI
 * is an execution entrypoint, so lexical `path.resolve` checks are not enough:
 * every directory is opened with O_NOFOLLOW and every file is read from the
 * bound descriptor before any authorization or database connection occurs.
 */
function resolveCliRepositoryRoot(value) {
  assertCliSecurePlatform();
  const target = path.resolve(requireText(value, 'repository root'));
  assertCliCanonicalDirectory(target, 'repository root');
  assertCliPrivateDirectoryStat(fs.lstatSync(target), 'repository root');
  return target;
}

function resolveCliArtifactPath(repoRoot, value, label) {
  const raw = requireText(value, label);
  if (raw.includes('\\') || raw.includes('\0')) {
    throw new Error(`${label} must be a normalized repository-relative or absolute path`);
  }
  const target = path.resolve(path.isAbsolute(raw) ? raw : path.join(repoRoot, raw));
  assertCliContained(repoRoot, target, label);
  return target;
}

function assertCliContained(repoRoot, target, label) {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(target));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside the repository root`);
  }
}

function assertCliBundleArtifact({ repoRoot, inputPath, bundle }) {
  const root = path.resolve(repoRoot);
  if (bundle?.executionMode !== 'ACTIVATION_GATED_AUTO') return;
  const domain = requireCliPathSegment(bundle.domainId, 'automatic bundle domainId');
  requireCliPathSegment(bundle.runId, 'automatic bundle runId');
  const artifactRoot = path.resolve(root, AUTOMATIC_BUNDLE_ROOT, domain, automaticArtifactRunId(bundle));
  const expectedBundlePaths = [...AUTOMATIC_BUNDLE_FILENAMES]
    .map((fileName) => path.join(artifactRoot, fileName));
  if (!expectedBundlePaths.includes(path.resolve(inputPath))) {
    throw new Error('automatic bundle path must be the canonical run-specific artifact');
  }
  assertCliDirectoryTree(root, artifactRoot, 'automatic bundle artifact root');
  const sourcePath = path.join(artifactRoot, 'source.json');
  const expectedSourcePath = path.relative(root, sourcePath).replaceAll('\\', '/');
  if (bundle?.source?.path !== expectedSourcePath) {
    throw new Error('automatic bundle source must remain in its canonical run-specific artifact');
  }
  const sourceBytes = readPrivateCliFileBytes(root, sourcePath, 'automatic bundle source');
  if (bundle?.source?.sha256 !== sha256Bytes(sourceBytes)) {
    throw new Error('automatic bundle source hash drifted');
  }
}

function assertCliResultOutputPath({ repoRoot, inputPath, outputPath, bundle }) {
  const root = path.resolve(repoRoot);
  assertCliContained(root, outputPath, '--output');
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new Error('--output must be distinct from --input');
  }
  let expectedDirectory = path.dirname(inputPath);
  if (bundle?.executionMode === 'ACTIVATION_GATED_AUTO') {
    const domain = requireCliPathSegment(bundle.domainId, 'automatic bundle domainId');
    requireCliPathSegment(bundle.runId, 'automatic bundle runId');
    expectedDirectory = path.resolve(root, AUTOMATIC_BUNDLE_ROOT, domain, automaticArtifactRunId(bundle));
    if (path.resolve(outputPath) !== path.join(expectedDirectory, CLI_RESULT_FILE_NAME)) {
      throw new Error('--output must be the canonical run-specific automatic result artifact');
    }
  }
  if (path.dirname(path.resolve(outputPath)) !== path.resolve(expectedDirectory)) {
    throw new Error('--output must remain beside the frozen bundle artifact');
  }
  assertCliDirectoryTree(root, expectedDirectory, 'CLI result output directory');
  try {
    fs.lstatSync(outputPath);
    throw new Error(`refusing to overwrite CLI result output: ${outputPath}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

function readPrivateCliFileBytes(repoRoot, filePath, label) {
  assertCliSecurePlatform();
  const root = path.resolve(repoRoot);
  const target = path.resolve(filePath);
  assertCliContained(root, target, label);
  const relative = path.relative(root, target);
  const segments = relative.split(path.sep);
  if (segments.length < 1 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must name a repository file`);
  }
  let directoryFd = openCliDirectory(root);
  let fileFd = null;
  try {
    assertCliPrivateDirectoryStat(fs.fstatSync(directoryFd), 'repository artifact root');
    for (const segment of segments.slice(0, -1)) {
      const childPath = path.join(cliDescriptorPath(directoryFd), segment);
      const childFd = fs.openSync(
        childPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      );
      assertCliPrivateDirectoryStat(fs.fstatSync(childFd), `${label} ancestor`);
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    const filePathAtDescriptor = path.join(cliDescriptorPath(directoryFd), segments.at(-1));
    fileFd = fs.openSync(filePathAtDescriptor, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fileFd);
    assertCliPrivateFileStat(before, label);
    const bytes = fs.readFileSync(fileFd);
    const after = fs.fstatSync(fileFd);
    if (before.dev !== after.dev || before.ino !== after.ino || after.size !== bytes.length) {
      throw new Error(`${label} identity or byte length changed during read`);
    }
    assertCliPrivateFileStat(after, label);
    const pathStat = fs.lstatSync(filePathAtDescriptor);
    if (pathStat.isSymbolicLink() || pathStat.dev !== before.dev || pathStat.ino !== before.ino) {
      throw new Error(`${label} identity changed or is unavailable`);
    }
    return bytes;
  } catch (error) {
    if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw new Error(`${label} must be an ordinary private file under a canonical directory`, { cause: error });
    }
    throw error;
  } finally {
    if (fileFd != null) fs.closeSync(fileFd);
    fs.closeSync(directoryFd);
  }
}

function writeJsonAtomic(filePath, payload, { repoRoot = process.cwd() } = {}) {
  assertCliSecurePlatform();
  const root = resolveCliRepositoryRoot(repoRoot);
  const target = resolveCliArtifactPath(root, filePath, 'CLI result output');
  const outputDirectory = path.dirname(target);
  assertCliDirectoryTree(root, outputDirectory, 'CLI result output directory');
  const directoryFd = openCliDirectory(outputDirectory);
  let temporaryFd = null;
  let temporaryPath = null;
  try {
    const directoryStat = fs.fstatSync(directoryFd);
    assertCliPrivateDirectoryStat(directoryStat, 'CLI result output directory');
    const directoryPath = cliDescriptorPath(directoryFd);
    ({ temporaryFd, temporaryPath } = createCliTemporaryFile({
      directoryPath,
      fileName: path.basename(target),
    }));
    const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(temporaryFd, bytes);
    fs.fchmodSync(temporaryFd, 0o600);
    const staged = fs.fstatSync(temporaryFd);
    assertCliPrivateFileStat(staged, 'CLI result staged artifact');
    const stagedIdentity = { dev: staged.dev, ino: staged.ino };
    fs.fsyncSync(temporaryFd);
    fs.closeSync(temporaryFd);
    temporaryFd = null;
    const destinationPath = path.join(directoryPath, path.basename(target));
    const beforeDirectory = fs.fstatSync(directoryFd);
    if (beforeDirectory.dev !== directoryStat.dev || beforeDirectory.ino !== directoryStat.ino) {
      throw new Error('CLI result output directory identity changed or is unavailable');
    }
    fs.linkSync(temporaryPath, destinationPath);
    let destinationFd = null;
    try {
      destinationFd = fs.openSync(destinationPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const destination = fs.fstatSync(destinationFd);
      assertCliPrivateFileStat(destination, 'CLI result output');
      if (destination.dev !== stagedIdentity.dev || destination.ino !== stagedIdentity.ino
          || destination.size !== bytes.length) {
        throw new Error('CLI result output identity or byte length changed during publication');
      }
      const pathStat = fs.lstatSync(destinationPath);
      if (pathStat.isSymbolicLink() || pathStat.dev !== destination.dev || pathStat.ino !== destination.ino) {
        throw new Error('CLI result output identity changed or is unavailable');
      }
    } finally {
      if (destinationFd != null) fs.closeSync(destinationFd);
    }
    fs.unlinkSync(temporaryPath);
    temporaryPath = null;
    fs.fsyncSync(directoryFd);
    return target;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`refusing to overwrite CLI result output: ${target}`, { cause: error });
    }
    throw error;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    if (temporaryPath != null) {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
    fs.closeSync(directoryFd);
  }
}

function createCliTemporaryFile({ directoryPath, fileName }) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | fs.constants.O_NOFOLLOW;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporaryPath = path.join(
      directoryPath,
      `.${fileName}.${randomBytes(16).toString('hex')}.tmp`,
    );
    try {
      return {
        temporaryPath,
        temporaryFd: fs.openSync(temporaryPath, flags, 0o600),
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('unable to reserve a secure CLI result temporary file');
}

function assertCliDirectoryTree(repoRoot, directoryPath, label) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(directoryPath);
  assertCliContained(root, target, label);
  assertCliCanonicalDirectory(root, 'repository root');
  const relative = path.relative(root, target);
  let current = root;
  let directoryFd = openCliDirectory(root);
  try {
    assertCliPrivateDirectoryStat(fs.fstatSync(directoryFd), 'repository root');
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      const childPath = path.join(cliDescriptorPath(directoryFd), segment);
      const childFd = fs.openSync(
        childPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      );
      fs.closeSync(directoryFd);
      directoryFd = childFd;
      current = path.join(current, segment);
      assertCliPrivateDirectoryStat(fs.fstatSync(directoryFd), `${label} ancestor`);
      assertCliCanonicalDirectory(current, `${label} ancestor`);
    }
  } catch (error) {
    if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw new Error(`${label} must be an existing canonical private directory`, { cause: error });
    }
    throw error;
  } finally {
    fs.closeSync(directoryFd);
  }
}

function openCliDirectory(directoryPath) {
  const target = path.resolve(directoryPath);
  const filesystemRoot = path.parse(target).root;
  let directoryFd = fs.openSync(
    filesystemRoot,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    for (const segment of path.relative(filesystemRoot, target).split(path.sep).filter(Boolean)) {
      const childFd = fs.openSync(
        path.join(cliDescriptorPath(directoryFd), segment),
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      );
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    throw error;
  }
}

function cliDescriptorPath(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function assertCliCanonicalDirectory(directoryPath, label) {
  const target = path.resolve(directoryPath);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    throw new Error(`${label} must be an existing canonical ordinary directory`, { cause: error });
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an existing canonical ordinary directory`);
  }
  let real;
  try {
    real = fs.realpathSync(target);
  } catch (error) {
    throw new Error(`${label} cannot be canonicalized`, { cause: error });
  }
  if (path.resolve(real) !== target) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
}

function assertCliPrivateDirectoryStat(stat, label) {
  if (!stat?.isDirectory?.() || stat.isSymbolicLink?.()
      || Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o022) !== 0) {
    throw new Error(`${label} must be an owner-owned non-writable-by-group-or-other directory`);
  }
}

function assertCliPrivateFileStat(stat, label) {
  if (!stat?.isFile?.() || stat.isSymbolicLink?.()
      || Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} must be an owner-owned ordinary private 0600 file`);
  }
}

function assertCliSecurePlatform() {
  if (process.platform !== 'linux'
      || typeof process.getuid !== 'function'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure supplementary L1 CLI artifact access is unavailable on this platform');
  }
}

function requireCliPathSegment(value, label) {
  const segment = requireText(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) {
    throw new Error(`${label} must be a safe path segment`);
  }
  return segment;
}

function requireAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('supplementary L1 adapter is required');
  for (const method of [
    'begin',
    'lockCurrentContext',
    'persistRunChain',
    'applyFrozenImport',
    'advanceMutationGenerations',
    'persistCommittedApply',
    'commit',
    'rollback',
  ]) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`supplementary L1 adapter.${method} is required`);
  }
}

function relativeRepositoryPath(repoRoot, filePath) {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(requireText(filePath, 'bundlePath'));
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('bundlePath must remain inside the repository root');
  }
  return relative;
}

function normalizeReconciliationInputPaths({ root, bundle, reconciliationInput }) {
  if (!reconciliationInput || typeof reconciliationInput !== 'object') {
    throw new Error('reconciliationInput is required for reconciliation input writes');
  }
  const names = {
    sourceCoveragePath: 'source-coverage',
    ownedTableReadbackPath: 'owned-table-readback',
    attemptStatePath: 'attempt-state',
  };
  const result = {};
  for (const [field, artifactName] of Object.entries(names)) {
    const value = requireText(reconciliationInput[field], `reconciliationInput.${field}`)
      .replaceAll('\\', '/');
    const expected = `${automaticReconciliationRoot(bundle)}/${artifactName}.json`;
    if (value !== expected) {
      throw new Error(`reconciliationInput.${field} must use the exact L1 run path`);
    }
    result[field] = assertRepositoryPathConfinement({
      repoRoot: root,
      filePath: path.resolve(root, value),
      label: `reconciliation ${artifactName} artifact`,
      createParent: true,
    });
  }
  return result;
}

function assertBoundAutomaticProgress(root, bundlePath, progressPath, bundle) {
  const progress = readOptionalRunProgress(root, bundlePath, progressPath);
  if (!progress || progress.status !== 'completed') throw new Error('automatic source progress must be completed before apply');
  assertAutomaticAttemptMatches(progress.payload, bundle.importPlan.automaticAttemptIdentity, 'source progress');
}

function assertUnusedAutomaticReconciliationInputs(root, bundle) {
  assertAutomaticReconciliationPathBinding(bundle);
  const paths = normalizeReconciliationInputPaths({ root, bundle, reconciliationInput: bundle.reconciliationInput });
  const expectedOutput = `${automaticReconciliationRoot(bundle)}/reconciliation-evidence.json`;
  for (const filePath of [...Object.values(paths), path.resolve(root, expectedOutput)]) {
    try { fs.lstatSync(filePath); } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error('automatic reconciliation artifact already exists; overwrite is forbidden');
  }
}

function assertAutomaticReconciliationPathBinding(bundle) {
  if (!bundle.reconciliationInput) throw new Error('automatic attempt requires reconciliation inputs');
  const names = {
    sourceCoveragePath: 'source-coverage',
    ownedTableReadbackPath: 'owned-table-readback',
    attemptStatePath: 'attempt-state',
    outputPath: 'reconciliation-evidence',
  };
  for (const [field, name] of Object.entries(names)) {
    if (bundle.reconciliationInput[field] !== `${automaticReconciliationRoot(bundle)}/${name}.json`) {
      throw new Error(`reconciliationInput.${field} must use the exact L1 run path`);
    }
  }
}

function readOptionalRunProgress(root, bundlePath, explicitProgressPath = null) {
  const progressPath = explicitProgressPath ?? path.join(path.dirname(bundlePath), 'progress.json');
  let stat;
  try {
    stat = fs.lstatSync(progressPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('L1 source progress must be an ordinary file');
  }
  const confined = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: progressPath,
    label: 'L1 source progress',
  });
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(confined, 'utf8'));
  } catch (error) {
    throw new Error(`L1 source progress must be valid JSON: ${error.message}`);
  }
  return {
    path: relativeRepositoryPath(root, confined),
    status: payload?.status ?? null,
    payload,
  };
}

function writeReconciliationInputArtifact(absolutePath, payload, root) {
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: absolutePath,
    label: 'reconciliation input artifact',
  });
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(absolutePath, bytes, { mode: 0o600, flag: 'wx' });
  return {
    path: relativeRepositoryPath(root, absolutePath),
    sha256: sha256Bytes(bytes),
  };
}

function validateAuthorizationContext(context, operationId, executionTime) {
  if (!context || context.operationId !== operationId) {
    throw new Error('authorization context operationId must match the supplementary L1 bundle');
  }
  for (const field of ['actor', 'reason', 'authorizationReference', 'decisionIdentity']) {
    requireText(context[field], field);
  }
  requireHash(context.packetHash, 'packetHash');
  const authorizedAt = requireTimestamp(context.authorizedAt, 'authorizedAt');
  const expiresAt = requireTimestamp(context.expiresAt, 'expiresAt');
  if (Date.parse(executionTime) < Date.parse(authorizedAt)
      || Date.parse(executionTime) >= Date.parse(expiresAt)) {
    throw new Error('authorization context is not currently valid');
  }
  if (context.executionMode === 'ACTIVATION_GATED_AUTO') {
    requireHash(context.activationPolicySetHash, 'activationPolicySetHash');
    requireText(context.activationDecisionIdentity, 'activationDecisionIdentity');
    requireHash(context.activationPacketHash, 'activationPacketHash');
  }
}

function assertCurrentContext({ current, bundle, authorizationContext, executionTime }) {
  if (!current || current.ownerStatus !== 'ACTIVE'
      || current.ownerUsername !== authorizationContext.actor) {
    throw new Error('active System Owner identity does not match the authorization');
  }
  for (const [label, expected, actual] of [
    ['domain', bundle.domainId, current.domainId],
    ['policy version', bundle.policy.policyVersion, Number(current.policyVersion)],
    ['policy hash', bundle.policy.policyHash, current.policyHash],
    ['policy set hash', bundle.policy.policySetHash, current.policySetHash],
    ['policy level', bundle.executionMode === 'ACTIVATION_GATED_AUTO' ? 'L2' : 'L1', current.currentLevel],
    ['policy operational state', 'ACTIVE', current.operationalState],
    ['baseline fingerprint', bundle.baselineFingerprint, current.baselineFingerprint],
  ]) {
    if (actual !== expected) throw new Error(`current ${label} does not match the frozen L1 bundle`);
  }
  if (current.approvalConsumed === true) throw new Error('L1 approval was already consumed');
  if (bundle.executionMode === 'ACTIVATION_GATED_AUTO') {
    assertExactAutomaticOwnedTables(bundle.ownedTables, current.ownedTables);
    for (const [label, expected, actual] of [
      ['activation decision identity', authorizationContext.activationDecisionIdentity, current.activationDecisionIdentity],
      ['activation packet hash', authorizationContext.activationPacketHash, current.activationPacketHash],
      ['activation policy set hash', authorizationContext.activationPolicySetHash, current.activationPolicySetHash],
    ]) {
      if (actual !== expected) throw new Error(`current ${label} does not match the activation gate`);
    }
    const expiresAt = requireTimestamp(current.activationExpiresAt, 'activation expiry');
    if (Date.parse(expiresAt) <= Date.parse(executionTime)) {
      throw new Error('scheduler activation decision is stale or expired');
    }
  }
}

function assertExactAutomaticOwnedTables(expected, actual) {
  const expectedScopes = normalizeAutomaticOwnedTableSequence(expected, 'bundle');
  const actualScopes = normalizeAutomaticOwnedTableSequence(actual, 'current');
  if (JSON.stringify(expectedScopes) !== JSON.stringify(actualScopes)) {
    throw new Error('automatic current owned table scope does not match the frozen bundle');
  }
}

function normalizeAutomaticOwnedTableSequence(scopes, label) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error(`automatic current ${label} owned table scopes are required`);
  }
  const seen = new Set();
  return scopes.map((scope) => {
    const normalized = {
      databaseRole: requireText(scope?.databaseRole, `automatic ${label} owned table databaseRole`),
      table: requireText(scope?.table, `automatic ${label} owned table table`),
      fieldGroup: requireText(scope?.fieldGroup, `automatic ${label} owned table fieldGroup`),
      ...(scope?.logicalPredicateHash == null
        ? {}
        : { logicalPredicateHash: requireHash(scope.logicalPredicateHash, `automatic ${label} owned table logicalPredicateHash`) }),
    };
    const key = `${normalized.databaseRole}:${normalized.table}:${normalized.fieldGroup}:${normalized.logicalPredicateHash ?? ''}`;
    if (seen.has(key)) throw new Error(`automatic ${label} owned table scopes contain duplicates`);
    seen.add(key);
    if (normalized.table === 'npcs' && normalized.logicalPredicateHash == null) {
      throw new Error(`automatic ${label} shared npcs scope requires a logical predicate hash`);
    }
    return normalized;
  });
}

function resolveCurrentOwnedTables({ bundle, policy, policyJson }) {
  const requested = bundle?.ownedTables;
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new Error('current context requires declared owned tables');
  }
  if (bundle.executionMode !== 'ACTIVATION_GATED_AUTO') {
    return requested.map((scope) => ({ ...scope }));
  }
  if (policy.currentLevel !== 'L2' || policy.operationalState !== 'ACTIVE') {
    throw new Error('automatic current context requires exact L2/ACTIVE policy');
  }
  if (!policyJson || !Array.isArray(policyJson.ownedTables) || policyJson.ownedTables.length === 0) {
    throw new Error('automatic current context requires policyJson.ownedTables');
  }
  const policyScopes = normalizeAutomaticOwnedTableSequence(
    policyJson.ownedTables,
    'policyJson',
  );
  assertSupplementaryOwnedTables(bundle.domainId, policyScopes);
  assertSupplementaryOwnedTables(bundle.domainId, requested);
  const requestedHasScopeMetadata = requested.every((scope) => scope?.fieldGroup != null);
  if (requestedHasScopeMetadata) {
    const requestedScopes = normalizeAutomaticOwnedTableSequence(requested, 'bundle');
    if (JSON.stringify(requestedScopes) !== JSON.stringify(policyScopes)) {
      throw new Error('automatic current policy owned table scopes do not match the persisted policy order or identity');
    }
  } else if (requested.some((scope) => scope?.fieldGroup != null)) {
    throw new Error('automatic current bundle owned table scopes must declare field groups together');
  } else {
    const requestedPhysicalScopes = requested.map((scope) => `${scope?.databaseRole}:${scope?.table}`);
    const policyPhysicalScopes = policyScopes.map((scope) => `${scope.databaseRole}:${scope.table}`);
    if (JSON.stringify(requestedPhysicalScopes) !== JSON.stringify(policyPhysicalScopes)) {
      throw new Error('automatic current policy owned tables do not match the persisted policy order');
    }
  }
  if (policyScopes.some((scope) => scope.table === 'npcs' && scope.logicalPredicateHash == null)) {
    throw new Error('automatic current shared npcs scope requires a logical predicate hash');
  }
  return policyScopes;
}

function parsePolicyJson(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    throw new Error('current policy JSON is invalid');
  }
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

export function connectionOptions(env) {
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') {
    throw new Error('TERRAPEDIA_DB_NAME must be exactly terria_v1_local');
  }
  return {
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port,
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: 'terria_v1_local',
    multipleStatements: false,
    dateStrings: true,
  };
}

function generationScopeHash(scope) {
  const fenceScope = resolveFenceScope(scope);
  return hashJson({
    databaseRole: scope.databaseRole,
    table: scope.table,
    fieldGroup: fenceScope.fieldGroup,
    ...(scope?.logicalPredicateHash == null
      ? { logicalPredicate: { kind: 'all' } }
      : { logicalPredicateHash: fenceScope.logicalPredicateHash }),
  });
}

function resolveFenceScope(scope) {
  const fieldGroup = requireText(scope?.fieldGroup ?? 'all_columns', 'owned table fieldGroup');
  const logicalPredicateHash = scope?.logicalPredicateHash == null
    ? hashJson({ kind: 'all' })
    : requireHash(scope.logicalPredicateHash, 'owned table logicalPredicateHash');
  return {
    databaseRole: requireText(scope?.databaseRole, 'owned table databaseRole'),
    table: requireText(scope?.table, 'owned table table'),
    fieldGroup,
    logicalPredicateHash,
  };
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Json(value) {
  return sha256Bytes(JSON.stringify(value));
}

function hashJson(value) {
  return sha256Bytes(JSON.stringify(stableValue(value)));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function toMysqlTimestamp(value) {
  return requireTimestamp(value, 'timestamp').replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export async function runSupplementaryL1OperationCliEntrypoint({
  runCli = runSupplementaryL1OperationCli,
  stdout = process.stdout,
  stderr = process.stderr,
  setExitCode = (value) => { process.exitCode = value; },
} = {}) {
  try {
    const result = await runCli();
    stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    stderr.write(`${JSON.stringify(serializeSupplementaryL1OperationFailure(error))}\n`);
    setExitCode(1);
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runSupplementaryL1OperationCliEntrypoint();
}
