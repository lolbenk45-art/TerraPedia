#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  acknowledgeWikiProbeSnapshot,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
} from '../lib/wiki-sync-manifest.mjs';
import {
  DOMAIN_PREVIEW_CONFIG,
  runSupplementaryDomainL1PreviewCli,
} from './prepare-supplementary-domain-l1-preview.mjs';
import {
  createMysqlSupplementaryL1Adapter,
  executeSupplementaryL1Operation,
  readVerifiedCommittedAutomaticBundle,
} from './run-supplementary-domain-l1-operation.mjs';
import {
  buildSupplementaryL1Bundle,
  validateSupplementaryL1Bundle,
} from './supplementary-domain-l1-contract.mjs';
import { buildAutomaticRunId, runImportThenAcknowledge } from './run-automatic-domain-operation.mjs';
import {
  automaticArtifactRunId,
  automaticAttemptIdentityFromEnvironment,
  automaticReconciliationRoot,
  freezeAutomaticSourceProgressSnapshot,
  readAutomaticSourceProgress,
} from './automatic-execution-artifacts.mjs';
import {
  assertCurrentSourceMonitorStateMatchesDispatchIdentity,
  assertFrozenSourceMonitorStateMatches,
  assertFrozenSourceMatchesDispatchIdentity,
  readFrozenSourceMonitorState,
  sourceDispatchIdentityFromEnvironment,
} from './source-dispatch-identity.mjs';
import {
  buildActionProgressPayload,
  createCrawlerAttemptProgressSequencer,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import { connectionOptions as isolatedConnectionOptions, loadIsolatedAcceptanceManifest } from './eight-domain-v2-isolated-acceptance.mjs';

const SCHEDULER_ACTIVATION_DOMAIN = 'crawler_v2_scheduler';
const AUTOMATIC_PREVIEW_ROOT = path.join(
  'reports',
  'authorization',
  'canonical',
  'automatic',
);

export async function runSupplementaryDomainAutomaticOperation({
  argv = process.argv.slice(2),
  env = process.env,
  now = null,
  nowProvider = () => new Date().toISOString(),
  mysqlModule = null,
  runPreviewImpl = runSupplementaryDomainL1PreviewCli,
  executeOperationImpl = executeSupplementaryL1Operation,
  acknowledgeSourceImpl = acknowledgeWikiProbeSnapshot,
  readSourceMonitorStateImpl = readFrozenSourceMonitorState,
  heartbeatIntervalMs = undefined,
} = {}) {
  const args = parseArgs(argv);
  const startTime = requireTimestamp(now ?? nowProvider(), 'operation start time');
  const domain = requireSupplementaryDomain(args.domain);
  if (args['run-id']) throw new Error('--run-id is not allowed for automatic operations');
  const repoRoot = path.resolve(env.WORKTREE_ROOT ?? process.cwd());
  const isolatedMode = String(env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE ?? '').trim() === 'true';
  const isolatedManifestPath = env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_MANIFEST_PATH;
  const isolatedManifest = isolatedMode
    ? loadIsolatedAcceptanceManifest({ repoRoot, manifestPath: isolatedManifestPath, domain, env })
    : null;
  const effectiveSourceMode = args['source-mode'] ?? (isolatedMode ? 'local' : 'live');
  if (!['live', 'local'].includes(effectiveSourceMode)) throw new Error('--source-mode must be live or local');
  const runnerProgress = createRunnerProgress({ args, env, domain, heartbeatIntervalMs });
  let sourceDispatchIdentity;
  let automaticAttemptIdentity;
  try {
    sourceDispatchIdentity = sourceDispatchIdentityFromEnvironment(env);
    automaticAttemptIdentity = automaticAttemptIdentityFromEnvironment(env, sourceDispatchIdentity);
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'source-identity', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  let frozenProbeState;
  try {
    frozenProbeState = sourceDispatchIdentity == null
      ? null
      : readSourceMonitorStateImpl({
          identity: sourceDispatchIdentity,
          domain,
          repoRoot,
          sourceStatePath: env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH,
        });
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'source-identity', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  const executionBinding = { sourceDispatchIdentity, importPlan: { automaticAttemptIdentity } };
  const previewRunId = automaticAttemptIdentity == null
    ? buildAutomaticPreviewRunId(domain, env)
    : automaticArtifactRunId({ runId: `${domain}_l1`, ...executionBinding });
  const previewArtifactRoot = resolveAutomaticPreviewArtifactRoot({ repoRoot, domain, previewRunId });
  const previewProgressPath = args['progress-path'] || env.TERRAPEDIA_CRAWLER_PROGRESS_PATH
    ? isolatePreviewProgressPath(args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH)
    : path.join(repoRoot, 'reports', 'runtime', 'automatic-preview', domain, `${previewRunId}.progress.json`);
  const previewArgs = [
    `--domain=${domain}`,
    `--execution-mode=ACTIVATION_GATED_AUTO`,
    `--run-id=${previewRunId}`,
    `--artifact-root=${previewArtifactRoot}`,
    `--progress-path=${previewProgressPath}`,
    ...(args['manifest-path'] ? [`--manifest-path=${args['manifest-path']}`] : []),
    '--defer-source-acknowledgement=true',
    ...(domain === 'shimmer' ? ['--persist-canonical-shimmer-proposal=false'] : []),
    ...(effectiveSourceMode === 'local' ? ['--reuse-current-source=true'] : []),
    ...(effectiveSourceMode === 'local' && domain === 'shimmer' ? ['--reuse-current-generation=true'] : []),
  ];
  let activation;
  let activationConnection;
  try {
    activationConnection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env, {
      domain,
      repoRoot,
      manifestPath: isolatedManifestPath,
    }));
    const [rows] = await activationConnection.query(
      'SELECT decision_identity AS decisionIdentity, packet_hash AS packetHash,'
      + ' policy_set_hash AS policySetHash, actor, reason, authorization_reference AS authorizationReference,'
      + ' authorized_at AS authorizedAt, expires_at AS expiresAt'
      + ' FROM crawler_automation_activation_decision'
      + ' WHERE decision_kind = ? AND domain_id = ?'
      + ' AND authorized_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP'
      + ' ORDER BY authorized_at DESC, id DESC LIMIT 1',
      ['SCHEDULER_ACTIVATION', SCHEDULER_ACTIVATION_DOMAIN],
    );
    activation = rows?.[0];
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'failed', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  } finally {
    await activationConnection?.end();
  }
  if (!activation) {
    const error = new Error(`no fresh scheduler activation for supplementary domain: ${domain}`);
    runnerProgress.publish({ status: 'failed', phase: 'failed', message: error.message });
    runnerProgress.stop();
    throw error;
  }

  runnerProgress.publish({
    status: 'running',
    phase: 'source-preview',
    message: `preparing frozen ${domain} source preview`,
  });
  let preview;
  try {
    preview = await runPreviewImpl({
      argv: previewArgs,
      env,
      now: startTime,
      mysqlModule,
      repoRoot,
      sourceDispatchIdentity,
      sourceStatePath: env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH,
    });
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'failed', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  let previewBinding;
  let previewBundle;
  try {
    previewBinding = readBoundAutomaticPreviewBundle({
      repoRoot,
      domain,
      previewRunId,
      preview,
    });
    previewBundle = previewBinding.bundle;
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'preview-artifact', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  const previewBundlePath = previewBinding.bundlePath;
  if (!preview.stableSourceSnapshot) {
    runnerProgress.publish({ status: 'failed', phase: 'source-stability', message: `supplementary ${domain} source was not stable enough to defer acknowledgement` });
    runnerProgress.stop();
    throw new Error(`supplementary ${domain} source was not stable enough to defer acknowledgement`);
  }
  try {
    assertFrozenSourceMonitorStateMatches(sourceDispatchIdentity, frozenProbeState);
    assertFrozenSourceMatchesDispatchIdentity(sourceDispatchIdentity, preview.stableSourceSnapshot.contentHash);
    if (sourceDispatchIdentity != null
        && preview.stableSourceSnapshot.checkedAt !== sourceDispatchIdentity.sourceRunIdentity) {
      throw new Error('supplementary frozen source checkedAt does not match the scheduler dispatch identity');
    }
    if (sourceDispatchIdentity != null
        && preview.stableSourceSnapshot.sourceKey !== frozenProbeState.sourceKey) {
      throw new Error('supplementary frozen source key does not match the scheduler dispatch identity');
    }
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'source-identity', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  const operationRunId = buildAutomaticRunId(domain, preview.stableSourceSnapshot.contentHash);
  const operationArtifactRoot = resolveAutomaticPreviewArtifactRoot({
    repoRoot,
    domain,
    previewRunId: automaticArtifactRunId({ runId: operationRunId, ...executionBinding }),
  });
  let operationBundlePath = path.join(operationArtifactRoot, 'operation.bundle.json');
  let expectedBundle;
  let previewSourceBytes;
  try {
    previewSourceBytes = readAutomaticPreviewSourceBytes({
      repoRoot,
      artifactRoot: previewBinding.artifactRoot,
      expectedIdentity: previewBinding.identity,
      expectedSource: previewBundle.source,
    });
    const operationSourcePath = path.join(operationArtifactRoot, 'source.json');
    const operationSourceRelativePath = path.relative(repoRoot, operationSourcePath).replaceAll('\\', '/');
    expectedBundle = buildSupplementaryL1Bundle({
      operationId: previewBundle.operationId,
      runId: operationRunId,
      domainId: previewBundle.domainId,
      generatedAt: previewBundle.generatedAt,
      executionMode: previewBundle.executionMode,
      policy: previewBundle.policy,
      baseline: previewBundle.baseline,
      source: {
        ...previewBundle.source,
        path: operationSourceRelativePath,
      },
      ownedTables: previewBundle.ownedTables,
      importPlan: {
        ...previewBundle.importPlan,
        automaticSourceFingerprint: preview.stableSourceSnapshot.contentHash,
        sourceCheckedAt: requireTimestamp(preview.stableSourceSnapshot.checkedAt, 'stable source checkedAt'),
        automaticPreviewSource: previewBundle.source,
        ...(automaticAttemptIdentity == null ? {} : { automaticAttemptIdentity }),
      },
      sourceDispatchIdentity,
      reconciliationInput: buildAutomaticReconciliationInput(domain, operationRunId, executionBinding),
    });
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'preview-artifact', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  runnerProgress.publish({ status: 'running', phase: 'database-apply', message: `applying frozen ${domain} bundle` });
  let connection;
  try {
    connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env, {
      domain,
      repoRoot,
      manifestPath: isolatedManifestPath,
    }));
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'database-apply', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  try {
    const sourceProgressSnapshotPath = automaticAttemptIdentity == null
      ? previewProgressPath
      : freezeAutomaticSourceProgressSnapshot({ repoRoot, progressPath: previewProgressPath, binding: expectedBundle });
    const existingArtifact = automaticOperationArtifactExists(operationArtifactRoot);
    const committedManifest = await readCommittedAutomaticRun(connection, {
      runId: operationRunId,
      domainId: domain,
      sourceFingerprint: preview.stableSourceSnapshot.contentHash,
      source: expectedBundle.source,
      sourceDispatchIdentity,
    });
    const alreadyCommitted = Boolean(committedManifest);
    let bundle;
    if (alreadyCommitted && automaticAttemptIdentity != null) {
      const original = readVerifiedCommittedAutomaticBundle({
        repoRoot, manifest: committedManifest, runId: operationRunId, domainId: domain, sourceDispatchIdentity,
      });
      operationBundlePath = original.bundlePath;
      bundle = readCommittedAutomaticRecoveryArtifact({
        repoRoot,
        artifactRoot: path.dirname(original.bundlePath),
        expectedBundle,
        expectedSourceBytes: previewSourceBytes,
        originalBundle: original.bundle,
      });
    } else if (existingArtifact) {
      if (!alreadyCommitted) {
        throw new Error('existing automatic operation artifact requires a verified committed run for acknowledgement recovery');
      }
      bundle = readCommittedAutomaticRecoveryArtifact({
        repoRoot,
        artifactRoot: operationArtifactRoot,
        expectedBundle,
        expectedSourceBytes: previewSourceBytes,
      });
    } else {
      if (alreadyCommitted) {
        throw new Error('verified committed automatic run requires its exact immutable operation artifact for acknowledgement recovery');
      }
      const operationArtifact = reserveAutomaticOperationArtifactDirectory({
        repoRoot,
        domain,
        runId: automaticArtifactRunId({ runId: operationRunId, ...executionBinding }),
      });
      publishAutomaticOperationArtifactNoOverwrite({
        repoRoot,
        artifactRoot: operationArtifact.artifactRoot,
        expectedIdentity: operationArtifact.identity,
        fileName: 'source.json',
        bytes: previewSourceBytes,
        label: 'automatic operation source',
      });
      writePrivateOperationBundleNoOverwrite({
        repoRoot,
        artifactRoot: operationArtifact.artifactRoot,
        expectedIdentity: operationArtifact.identity,
        outputPath: operationBundlePath,
        payload: expectedBundle,
      });
      bundle = expectedBundle;
    }
    if (activation.policySetHash !== bundle.policy.policySetHash) {
      throw new Error('scheduler activation policy set does not match frozen supplementary bundle');
    }
    const latestActivation = await loadFreshActivation(connection);
    assertActivationUnchanged(activation, latestActivation);
    const executionTime = maxSupplementaryAutomaticExecutionTime(
      startTime,
      preview.stableSourceSnapshot.checkedAt,
      nowProvider(),
    );
    assertActivationValidAt(latestActivation, executionTime);
    const authorizationContext = {
      operationId: bundle.operationId,
      actor: latestActivation.actor,
      reason: latestActivation.reason,
      authorizationReference: latestActivation.authorizationReference,
      decisionIdentity: latestActivation.decisionIdentity,
      packetHash: latestActivation.packetHash,
      authorizedAt: latestActivation.authorizedAt,
      expiresAt: latestActivation.expiresAt,
      executionMode: 'ACTIVATION_GATED_AUTO',
      activationDecisionIdentity: latestActivation.decisionIdentity,
      activationPacketHash: latestActivation.packetHash,
      activationPolicySetHash: latestActivation.policySetHash,
    };
    const acknowledgeSource = effectiveSourceMode === 'live'
      ? async () => {
          assertCurrentSourceMonitorStateMatchesDispatchIdentity({
            identity: sourceDispatchIdentity,
            domain,
            repoRoot,
            sourceStatePath: env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH,
            readSourceMonitorStateImpl,
          });
          const acknowledgementActivation = await loadFreshActivation(connection);
          assertActivationUnchanged(activation, acknowledgementActivation);
          const acknowledgementTime = maxSupplementaryAutomaticExecutionTime(
            startTime,
            preview.stableSourceSnapshot.checkedAt,
            nowProvider(),
          );
          assertActivationValidAt(acknowledgementActivation, acknowledgementTime);
          if (automaticAttemptIdentity != null) {
            // Recovery acknowledges this attempt's verified progress while the
            // committed bundle intentionally retains the importing attempt.
            for (const progressPath of [previewProgressPath, sourceProgressSnapshotPath]) {
              readAutomaticSourceProgress({ repoRoot, progressPath, binding: expectedBundle });
            }
          }
          return acknowledgeSourceImpl({
            manifestPath: args['manifest-path'] ?? DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
            snapshot: preview.stableSourceSnapshot,
            outputPath: operationBundlePath,
          });
        }
      : async () => {};
    const result = await runImportThenAcknowledge({
      alreadyCommitted,
      executeImport: () => executeOperationImpl({
        adapter: createMysqlSupplementaryL1Adapter(connection, {
          bundlePath: operationBundlePath,
          repoRoot,
          progressPath: sourceProgressSnapshotPath,
        }),
        bundle,
        authorizationContext,
        now: executionTime,
      }),
      acknowledgeSource,
    });
    runnerProgress.publish({
      status: 'completed',
      phase: alreadyCommitted ? 'acknowledgement-reconciled' : 'completed',
      message: alreadyCommitted ? `reconciled committed ${domain} acknowledgement` : `completed ${domain} automatic operation`,
    });
    const operationResult = {
      ...(alreadyCommitted ? { ...result, domainId: domain, runId: operationRunId } : result),
      previewBundlePath,
      operationBundlePath,
    };
    return effectiveSourceMode === 'live'
      ? operationResult
      : {
          ...operationResult,
          sourceAcknowledged: false,
          sourceAcknowledgementReason: 'local_source_not_acknowledged',
        };
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'failed', message: error?.message ?? String(error) });
    throw error;
  } finally {
    runnerProgress.stop();
    await connection.end();
  }
}

function isolatePreviewProgressPath(progressPath) {
  const resolved = path.resolve(progressPath);
  return resolved.endsWith('.json')
    ? `${resolved.slice(0, -'.json'.length)}.preview.json`
    : `${resolved}.preview.json`;
}

export function buildAutomaticReconciliationInput(domain, runId, binding = {}) {
  const root = automaticReconciliationRoot({ ...binding, domainId: domain, runId });
  return {
    sourceCoveragePath: `${root}/source-coverage.json`,
    ownedTableReadbackPath: `${root}/owned-table-readback.json`,
    attemptStatePath: `${root}/attempt-state.json`,
    outputPath: `${root}/reconciliation-evidence.json`,
  };
}

export function buildAutomaticPreviewRunId(domain, env = process.env) {
  const attempt = String(env.TERRAPEDIA_CRAWLER_ATTEMPT_ID ?? '')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
    .slice(-20);
  const entropy = `${Date.now().toString(36)}_${process.pid.toString(36)}`;
  return `${domain}_l1_auto_preview_${entropy}${attempt ? `_${attempt}` : ''}`.slice(0, 80);
}

function createRunnerProgress({ args, env, domain, heartbeatIntervalMs }) {
  const progressValue = args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH;
  if (!progressValue) return { publish: () => {}, stop: () => {} };
  const progressPath = path.resolve(progressValue);
  const actionId = ({ audio: 'wiki-audio-assets-refresh', bosses: 'domain-source-bosses', shimmer: 'domain-source-shimmer' })[domain];
  const sequencer = createCrawlerAttemptProgressSequencer(env);
  const heartbeat = createCrawlerProgressHeartbeat({
    ...(heartbeatIntervalMs == null ? {} : { intervalMs: heartbeatIntervalMs }),
    writeProgress(payload) {
      const observedProgressSequence = readProgressSequence(progressPath);
      writeJsonFile(progressPath, sequencer.next(payload, { observedProgressSequence }));
    },
  });
  return {
    publish({ status, phase, message }) {
      const timestamp = new Date().toISOString();
      heartbeat.publish(buildActionProgressPayload({
        actionId,
        status,
        generatedAt: timestamp,
        lastHeartbeatAt: timestamp,
        childStatusPath: progressPath,
        phase,
        message,
        current: status === 'completed' ? 1 : 0,
        total: 1,
      }));
    },
    stop: heartbeat.stop,
  };
}

function readProgressSequence(progressPath) {
  try {
    const value = JSON.parse(fs.readFileSync(progressPath, 'utf8'))?.progressSequence;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  } catch {
    return null;
  }
}

async function readCommittedAutomaticRun(connection, {
  runId,
  domainId,
  sourceFingerprint,
  source,
  sourceDispatchIdentity = null,
}) {
  const [rows] = await connection.query(
    'SELECT r.primary_domain_id AS domainId, es.manifest_json AS manifestJson FROM crawler_automation_run r'
    + ' JOIN crawler_automation_apply a ON a.run_id = r.run_id'
    + ' JOIN crawler_automation_evidence_set es ON es.run_id = r.run_id'
    + ' WHERE r.run_id = ? AND r.status = ? AND a.status = ? LIMIT 1',
    [runId, 'COMPLETED', 'COMMITTED'],
  );
  const committed = rows?.[0];
  if (!committed) return false;
  const manifest = typeof committed.manifestJson === 'string'
    ? JSON.parse(committed.manifestJson)
    : committed.manifestJson;
  if (committed.domainId !== domainId) {
    throw new Error('committed automatic run evidence does not match frozen source');
  }
  const recordedFingerprint = manifest?.automaticSourceFingerprint;
  if (recordedFingerprint !== sourceFingerprint) {
    throw new Error('committed automatic run evidence does not match frozen source');
  }
  if (sourceDispatchIdentity != null
      && !sameJsonValue(manifest?.sourceDispatchIdentity, sourceDispatchIdentity)) {
    throw new Error('committed automatic run evidence does not match the scheduler source dispatch identity');
  }
  const exactFrozenSource = manifest?.source?.path === source.path
    && manifest?.source?.sha256 === source.sha256;
  if (exactFrozenSource || sourceDispatchIdentity != null && manifest?.source?.sha256 === source.sha256) return manifest;
  throw new Error('committed automatic run evidence does not match frozen source');
}

async function loadFreshActivation(connection) {
  const [rows] = await connection.query(
    'SELECT decision_identity AS decisionIdentity, packet_hash AS packetHash,'
    + ' policy_set_hash AS policySetHash, actor, reason, authorization_reference AS authorizationReference,'
    + ' authorized_at AS authorizedAt, expires_at AS expiresAt'
    + ' FROM crawler_automation_activation_decision'
    + ' WHERE decision_kind = ? AND domain_id = ?'
    + ' AND authorized_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP'
    + ' ORDER BY authorized_at DESC, id DESC LIMIT 1',
    ['SCHEDULER_ACTIVATION', SCHEDULER_ACTIVATION_DOMAIN],
  );
  return rows?.[0] ?? null;
}

function assertActivationUnchanged(initial, latest) {
  if (!latest) {
    throw new Error('scheduler activation expired or was revoked before automatic mutation');
  }
  for (const field of [
    'decisionIdentity',
    'packetHash',
    'policySetHash',
    'actor',
    'reason',
    'authorizationReference',
    'authorizedAt',
    'expiresAt',
  ]) {
    if (latest[field] !== initial?.[field]) {
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

function automaticOperationArtifactExists(artifactRoot) {
  try {
    const stat = fs.lstatSync(artifactRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('automatic operation artifact directory must be a canonical ordinary directory');
    }
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw automaticArtifactDirectoryError(error);
  }
}

function readCommittedAutomaticRecoveryArtifact({
  repoRoot,
  artifactRoot,
  expectedBundle,
  expectedSourceBytes,
  originalBundle = null,
}) {
  const binding = bindAutomaticPreviewDirectory({ repoRoot, artifactRoot });
  try {
    const sourceBytes = readBoundAutomaticPreviewFile(
      binding.fd,
      'source.json',
      'committed automatic operation source',
    );
    if (!Buffer.isBuffer(expectedSourceBytes) || !sourceBytes.equals(expectedSourceBytes)) {
      throw new Error('committed automatic operation artifact source does not match the fresh frozen source');
    }
    const bundleBytes = readBoundAutomaticPreviewFile(
      binding.fd,
      'operation.bundle.json',
      'committed automatic operation bundle',
    );
    let bundle;
    try {
      bundle = JSON.parse(bundleBytes.toString('utf8'));
    } catch (error) {
      throw new Error('committed automatic operation bundle is not valid JSON', { cause: error });
    }
    validateSupplementaryL1Bundle(bundle);
    if (originalBundle != null && !sameJsonValue(bundle, originalBundle)) {
      throw new Error('committed automatic operation artifact changed after manifest verification');
    }
    assertCommittedAutomaticRecoveryBundleMatches(bundle, expectedBundle, originalBundle != null);
    assertAutomaticDirectoryIdentityAtPath(artifactRoot, binding.identity);
    return bundle;
  } finally {
    fs.closeSync(binding.fd);
  }
}

function assertCommittedAutomaticRecoveryBundleMatches(bundle, expectedBundle, verifiedOriginal = false) {
  // Only a manifest-hash-verified original may retain its old execution paths
  // and attempt tuple. All original bytes, source, scope and policy still bind.
  if (verifiedOriginal) {
    expectedBundle = {
      ...expectedBundle,
      source: { ...expectedBundle.source, path: bundle.source.path },
      reconciliationInput: bundle.reconciliationInput,
      importPlan: { ...expectedBundle.importPlan, automaticAttemptIdentity: bundle.importPlan.automaticAttemptIdentity },
    };
  }
  const identityFields = [
    'operationId',
    'runId',
    'domainId',
    'executionMode',
    'policy',
    'source',
    'sourceDispatchIdentity',
    'ownedTables',
    'reconciliationInput',
  ];
  for (const field of identityFields) {
    if (!sameJsonValue(bundle?.[field], expectedBundle?.[field])) {
      throw new Error(`committed automatic operation artifact ${field} does not match the fresh frozen operation`);
    }
  }
  // The immutable artifact's baseline is intentionally not compared with a
  // newly generated preview. A verified commit advances the mutation
  // generations, so an acknowledgement-only retry necessarily observes a
  // later current baseline. The persisted artifact self-validates its own
  // original baseline, while the exact run/source evidence and current policy
  // bindings above prevent treating another operation as this recovery.
  const actualImportPlan = bundle?.importPlan;
  const expectedImportPlan = expectedBundle?.importPlan;
  if (!actualImportPlan || typeof actualImportPlan !== 'object'
      || !expectedImportPlan || typeof expectedImportPlan !== 'object') {
    throw new Error('committed automatic operation artifact import plan is missing');
  }
  const {
    sourceCheckedAt: actualSourceCheckedAt,
    automaticPreviewSource: actualPreviewSource,
    ...actualStableImportPlan
  } = actualImportPlan;
  const {
    sourceCheckedAt: _expectedSourceCheckedAt,
    automaticPreviewSource: expectedPreviewSource,
    ...expectedStableImportPlan
  } = expectedImportPlan;
  if (!sameJsonValue(actualStableImportPlan, expectedStableImportPlan)
      || !isTimestamp(actualSourceCheckedAt)
      || actualPreviewSource?.sha256 !== expectedPreviewSource?.sha256) {
    throw new Error('committed automatic operation artifact import plan does not match the fresh frozen source');
  }
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function resolveAutomaticPreviewArtifactRoot({ repoRoot, domain, previewRunId }) {
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const normalizedDomain = requireSafeSegment(domain, 'automatic preview domain');
  const normalizedRunId = requireSafeSegment(previewRunId, 'automatic preview runId');
  const target = path.resolve(root, AUTOMATIC_PREVIEW_ROOT, normalizedDomain, normalizedRunId);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('automatic preview artifact root must remain inside the repository');
  }
  return target;
}

function readBoundAutomaticPreviewBundle({ repoRoot, domain, previewRunId, preview }) {
  const artifactRoot = resolveAutomaticPreviewArtifactRoot({ repoRoot, domain, previewRunId });
  const expectedBundlePath = path.join(artifactRoot, 'bundle.json');
  const suppliedBundlePath = requireText(preview?.bundlePath, 'preview bundle path');
  if (!path.isAbsolute(suppliedBundlePath) || suppliedBundlePath !== expectedBundlePath) {
    throw new Error('preview bundle path must be the canonical run-specific automatic artifact');
  }
  const directory = bindAutomaticPreviewDirectory({ repoRoot, artifactRoot });
  try {
    const bytes = readBoundAutomaticPreviewFile(directory.fd, 'bundle.json', 'automatic preview bundle');
    let bundle;
    try {
      bundle = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new Error('automatic preview bundle is not valid JSON', { cause: error });
    }
    if (bundle?.domainId !== domain || bundle?.executionMode !== 'ACTIVATION_GATED_AUTO') {
      throw new Error('automatic preview bundle execution identity is invalid');
    }
    if (bundle?.runId !== previewRunId) {
      throw new Error('automatic preview bundle runId does not match its canonical run-specific artifact');
    }
    const expectedSourcePath = path.join(artifactRoot, 'source.json');
    const expectedSourceRelative = path.relative(repoRoot, expectedSourcePath).replaceAll('\\', '/');
    if (bundle?.source?.path !== expectedSourceRelative) {
      throw new Error('automatic preview bundle source must remain in its canonical run-specific artifact');
    }
    const sourceBytes = readBoundAutomaticPreviewFile(directory.fd, 'source.json', 'automatic preview source');
    if (bundle?.source?.sha256 !== sha256Bytes(sourceBytes)) {
      throw new Error('automatic preview source hash drifted');
    }
    validateSupplementaryL1Bundle(bundle);
    return Object.freeze({
      bundlePath: expectedBundlePath,
      artifactRoot,
      identity: directory.identity,
      bundle,
    });
  } finally {
    fs.closeSync(directory.fd);
  }
}

function readBoundAutomaticPreviewFile(directoryFd, fileName, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName)) {
    throw new Error(`${label} must name a safe file`);
  }
  const descriptorPath = descriptorDirectoryPathFor(directoryFd);
  const filePath = path.join(descriptorPath, fileName);
  let fileFd = null;
  try {
    fileFd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fileFd);
    assertPrivateAutomaticPreviewFile(stat, label);
    const bytes = fs.readFileSync(fileFd);
    const after = fs.fstatSync(fileFd);
    if (!sameFileIdentity(stat, after) || after.size !== bytes.length) {
      throw new Error(`${label} identity changed or is unavailable`);
    }
    const destination = fs.lstatSync(filePath);
    if (!sameFileIdentity(stat, destination) || destination.isSymbolicLink()) {
      throw new Error(`${label} identity changed or is unavailable`);
    }
    return bytes;
  } catch (error) {
    if (error?.code === 'ELOOP') {
      throw new Error(`${label} must be an ordinary non-symlink file`, { cause: error });
    }
    throw error;
  } finally {
    if (fileFd != null) fs.closeSync(fileFd);
  }
}

function bindAutomaticPreviewDirectory({ repoRoot, artifactRoot }) {
  assertSecureAutomaticArtifactPublicationSupported();
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const target = path.resolve(requireText(artifactRoot, 'automatic preview artifact root'));
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('automatic preview artifact root must remain inside the repository');
  }
  assertCanonicalAutomaticDirectoryPath(root, 'repository root');
  let fd = openBoundAutomaticDirectory(root);
  try {
    assertPrivateAutomaticDirectory(fs.fstatSync(fd), 'repository root');
    let current = root;
    for (const segment of relative.split(path.sep)) {
      const childPath = path.join(descriptorDirectoryPathFor(fd), segment);
      const childFd = openBoundAutomaticDirectoryAtPath(childPath);
      fs.closeSync(fd);
      fd = childFd;
      current = path.join(current, segment);
      assertPrivateAutomaticDirectory(fs.fstatSync(fd), 'automatic preview artifact ancestor');
      assertCanonicalAutomaticDirectoryPath(current, 'automatic preview artifact ancestor');
    }
    const identity = fs.fstatSync(fd);
    return Object.freeze({ fd, identity: Object.freeze({ dev: identity.dev, ino: identity.ino }) });
  } catch (error) {
    fs.closeSync(fd);
    throw automaticArtifactDirectoryError(error);
  }
}

function reserveAutomaticOperationArtifactDirectory({ repoRoot, domain, runId }) {
  assertSecureAutomaticArtifactPublicationSupported();
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const artifactRoot = resolveAutomaticPreviewArtifactRoot({
    repoRoot: root,
    domain,
    previewRunId: runId,
  });
  const parentRoot = path.dirname(artifactRoot);
  const parentBinding = bindAutomaticPreviewDirectory({
    repoRoot: root,
    artifactRoot: parentRoot,
  });
  let childFd = null;
  try {
    assertPrivateAutomaticDirectory(fs.fstatSync(parentBinding.fd), 'automatic operation artifact parent');
    assertAutomaticDirectoryIdentityAtPath(parentRoot, parentBinding.identity);
    const directoryPath = descriptorDirectoryPathFor(parentBinding.fd);
    const childPath = path.join(directoryPath, path.basename(artifactRoot));
    try {
      fs.mkdirSync(childPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(`automatic operation artifact directory already exists; overwrite is forbidden: ${artifactRoot}`, { cause: error });
      }
      throw error;
    }
    fs.fsyncSync(parentBinding.fd);
    childFd = openBoundAutomaticDirectoryAtPath(childPath);
    assertPrivateAutomaticDirectory(fs.fstatSync(childFd), 'automatic operation artifact directory');
    assertCanonicalAutomaticDirectoryPath(artifactRoot, 'automatic operation artifact directory');
    assertAutomaticDirectoryIdentityAtPath(parentRoot, parentBinding.identity);
    const identity = fs.fstatSync(childFd);
    return Object.freeze({
      artifactRoot,
      identity: Object.freeze({ dev: identity.dev, ino: identity.ino }),
    });
  } catch (error) {
    throw automaticArtifactDirectoryError(error);
  } finally {
    if (childFd != null) fs.closeSync(childFd);
    fs.closeSync(parentBinding.fd);
  }
}

function readAutomaticPreviewSourceBytes({ repoRoot, artifactRoot, expectedIdentity, expectedSource }) {
  const binding = bindAutomaticPreviewDirectory({ repoRoot, artifactRoot });
  try {
    if (expectedIdentity != null && !sameFileIdentity(expectedIdentity, binding.identity)) {
      throw new Error('automatic preview artifact directory identity changed or is unavailable');
    }
    const bytes = readBoundAutomaticPreviewFile(binding.fd, 'source.json', 'automatic preview source');
    if (sha256Bytes(bytes) !== expectedSource?.sha256) {
      throw new Error('automatic preview source hash drifted');
    }
    assertAutomaticDirectoryIdentityAtPath(artifactRoot, binding.identity);
    return bytes;
  } finally {
    fs.closeSync(binding.fd);
  }
}

function writePrivateOperationBundleNoOverwrite({
  repoRoot,
  artifactRoot,
  expectedIdentity,
  outputPath,
  payload,
}) {
  const target = path.resolve(requireText(outputPath, 'operation bundle path'));
  if (path.basename(target) !== 'operation.bundle.json') {
    throw new Error('automatic operation bundle must use operation.bundle.json');
  }
  publishAutomaticOperationArtifactNoOverwrite({
    repoRoot,
    artifactRoot,
    expectedIdentity,
    fileName: 'operation.bundle.json',
    bytes: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
    label: 'automatic operation bundle',
  });
}

function publishAutomaticOperationArtifactNoOverwrite({
  repoRoot,
  artifactRoot,
  expectedIdentity,
  fileName,
  bytes,
  label,
}) {
  assertSecureOperationBundlePublicationSupported();
  const root = path.resolve(requireText(artifactRoot, 'automatic operation artifact root'));
  const target = path.resolve(root, requireText(fileName, 'automatic operation artifact file'));
  if (path.dirname(target) !== root) {
    throw new Error(`${label} must remain in the canonical operation artifact directory`);
  }
  assertCanonicalAutomaticDirectoryPath(path.resolve(requireText(repoRoot, 'repository root')), 'repository root');
  const binding = bindAutomaticPreviewDirectory({ repoRoot, artifactRoot: root });
  const directoryFd = binding.fd;
  let temporaryFd = null;
  let temporaryPath = null;
  try {
    if (expectedIdentity != null && !sameFileIdentity(expectedIdentity, binding.identity)) {
      throw new Error('automatic operation artifact directory identity changed or is unavailable');
    }
    assertPrivateAutomaticDirectory(fs.fstatSync(directoryFd), 'automatic operation artifact directory');
    const directoryPath = descriptorDirectoryPathFor(directoryFd);
    ({ temporaryFd, temporaryPath } = createBoundOperationBundleTemporaryFile({ directoryPath, fileName }));
    fs.writeFileSync(temporaryFd, bytes);
    fs.fchmodSync(temporaryFd, 0o600);
    const staged = fs.fstatSync(temporaryFd);
    assertPrivateAutomaticPreviewFile(staged, `${label} staged artifact`);
    const stagedIdentity = { dev: staged.dev, ino: staged.ino };
    fs.fsyncSync(temporaryFd);
    fs.closeSync(temporaryFd);
    temporaryFd = null;
    const destinationPath = path.join(directoryPath, fileName);
    assertAutomaticDirectoryIdentityAtPath(root, binding.identity);
    fs.linkSync(temporaryPath, destinationPath);
    let destinationFd = null;
    try {
      destinationFd = fs.openSync(destinationPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const destination = fs.fstatSync(destinationFd);
      assertPrivateAutomaticPreviewFile(destination, label);
      if (!sameFileIdentity(stagedIdentity, destination) || destination.size !== bytes.length) {
        throw new Error(`${label} identity or byte length changed during publication`);
      }
      const destinationPathStat = fs.lstatSync(destinationPath);
      if (destinationPathStat.isSymbolicLink() || !sameFileIdentity(destination, destinationPathStat)) {
        throw new Error(`${label} identity changed or is unavailable`);
      }
    } catch (error) {
      if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
        throw new Error(`${label} identity changed or is unavailable`, { cause: error });
      }
      throw error;
    } finally {
      if (destinationFd != null) fs.closeSync(destinationFd);
    }
    assertAutomaticDirectoryIdentityAtPath(root, binding.identity);
    fs.unlinkSync(temporaryPath);
    temporaryPath = null;
    fs.fsyncSync(directoryFd);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`${label} already exists; overwrite is forbidden: ${target}`, { cause: error });
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

function assertSecureOperationBundlePublicationSupported() {
  if (process.platform !== 'linux'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure automatic operation bundle publication is unavailable on this platform');
  }
}

function assertSecureAutomaticArtifactPublicationSupported() {
  if (process.platform !== 'linux'
      || typeof process.getuid !== 'function'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure automatic preview artifact access is unavailable on this platform');
  }
}

function openBoundAutomaticDirectory(directoryPath) {
  const target = path.resolve(directoryPath);
  const filesystemRoot = path.parse(target).root;
  let directoryFd = openBoundAutomaticDirectoryAtPath(filesystemRoot);
  try {
    for (const segment of path.relative(filesystemRoot, target).split(path.sep).filter(Boolean)) {
      const childFd = openBoundAutomaticDirectoryAtPath(path.join(descriptorDirectoryPathFor(directoryFd), segment));
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw new Error('automatic operation bundle directory identity changed or is unavailable', { cause: error });
    }
    throw error;
  }
}

function openBoundAutomaticDirectoryAtPath(directoryPath) {
  return fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

function descriptorDirectoryPathFor(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function createBoundOperationBundleTemporaryFile({ directoryPath, fileName }) {
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
  throw new Error('unable to reserve a secure automatic operation bundle temporary file');
}

function assertCanonicalAutomaticDirectoryPath(directoryPath, label) {
  const target = path.resolve(directoryPath);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    throw automaticArtifactDirectoryError(error);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
  let real;
  try {
    real = fs.realpathSync(target);
  } catch (error) {
    throw automaticArtifactDirectoryError(error);
  }
  if (path.resolve(real) !== target) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
  return stat;
}

function assertPrivateAutomaticDirectory(stat, label) {
  if (!stat?.isDirectory?.() || stat.isSymbolicLink?.()) {
    throw new Error(`${label} must be an ordinary directory`);
  }
  if (Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o022) !== 0) {
    throw new Error(`${label} must be owned by the automation service UID and not group/other writable`);
  }
}

function assertPrivateAutomaticPreviewFile(stat, label) {
  if (!stat?.isFile?.() || stat.isSymbolicLink?.()
      || Number(stat.uid) !== Number(process.getuid())
      || (stat.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} must be an ordinary private 0600 file owned by the automation service UID`);
  }
}

function assertAutomaticDirectoryIdentityAtPath(directoryPath, expectedIdentity) {
  const currentFd = openBoundAutomaticDirectory(directoryPath);
  try {
    const current = fs.fstatSync(currentFd);
    if (!sameFileIdentity(current, expectedIdentity)) {
      throw new Error('automatic preview artifact directory identity changed or is unavailable');
    }
  } finally {
    fs.closeSync(currentFd);
  }
}

function sameFileIdentity(left, right) {
  return left != null && right != null && left.dev === right.dev && left.ino === right.ino;
}

function automaticArtifactDirectoryError(error) {
  if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
    return new Error('automatic preview artifact directory identity changed or is unavailable', { cause: error });
  }
  return error;
}

function requireSafeSegment(value, label) {
  const segment = requireText(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) {
    throw new Error(`${label} must be a safe path segment`);
  }
  return segment;
}

function connectionOptions(env, context = {}) {
  return isolatedConnectionOptions(env, context);
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireSupplementaryDomain(value) {
  const domain = requireText(value, '--domain');
  if (!Object.prototype.hasOwnProperty.call(DOMAIN_PREVIEW_CONFIG, domain)) {
    throw new Error(`unsupported supplementary domain: ${domain}`);
  }
  return domain;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function maxSupplementaryAutomaticExecutionTime(startTime, sourceCheckedAt, currentTime) {
  const values = [
    requireTimestamp(startTime, 'operation start time'),
    requireTimestamp(sourceCheckedAt, 'stable source checkedAt'),
    requireTimestamp(currentTime, 'current execution time'),
  ];
  const latest = Math.max(...values.map((value) => Date.parse(value)));
  return values.find((value) => Date.parse(value) === latest);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSupplementaryDomainAutomaticOperation().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`supplementary automatic operation failed: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
