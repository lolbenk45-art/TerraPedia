#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  acknowledgeWikiProbeSnapshot,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
} from '../lib/wiki-sync-manifest.mjs';
import { runSupplementaryDomainL1PreviewCli } from './prepare-supplementary-domain-l1-preview.mjs';
import {
  createMysqlSupplementaryL1Adapter,
  executeSupplementaryL1Operation,
} from './run-supplementary-domain-l1-operation.mjs';
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';
import { buildAutomaticRunId, runImportThenAcknowledge } from './run-automatic-domain-operation.mjs';
import {
  buildActionProgressPayload,
  createCrawlerAttemptProgressSequencer,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

const SCHEDULER_ACTIVATION_DOMAIN = 'crawler_v2_scheduler';

export async function runSupplementaryDomainAutomaticOperation({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date().toISOString(),
  mysqlModule = null,
  runPreviewImpl = runSupplementaryDomainL1PreviewCli,
  executeOperationImpl = executeSupplementaryL1Operation,
  acknowledgeSourceImpl = acknowledgeWikiProbeSnapshot,
  heartbeatIntervalMs = undefined,
} = {}) {
  const args = parseArgs(argv);
  const domain = requireText(args.domain, '--domain');
  if (args['run-id']) throw new Error('--run-id is not allowed for automatic operations');
  const sourceMode = args['source-mode'] ?? 'live';
  if (!['live', 'local'].includes(sourceMode)) throw new Error('--source-mode must be live or local');
  const runnerProgress = createRunnerProgress({ args, env, domain, heartbeatIntervalMs });
  const previewProgressPath = args['progress-path']
    ? isolatePreviewProgressPath(args['progress-path'])
    : null;
  const previewArgs = [
    `--domain=${domain}`,
    `--execution-mode=ACTIVATION_GATED_AUTO`,
    ...(previewProgressPath ? [`--progress-path=${previewProgressPath}`] : []),
    ...(args['manifest-path'] ? [`--manifest-path=${args['manifest-path']}`] : []),
    '--defer-source-acknowledgement=true',
    ...(domain === 'shimmer' ? ['--persist-canonical-shimmer-proposal=false'] : []),
    ...(sourceMode === 'local' ? ['--reuse-current-source=true'] : []),
    ...(sourceMode === 'local' && domain === 'shimmer' ? ['--reuse-current-generation=true'] : []),
  ];
  const activationConnection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  let activation;
  try {
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
  } finally {
    await activationConnection.end();
  }
  if (!activation) throw new Error(`no fresh scheduler activation for supplementary domain: ${domain}`);

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
      now,
      mysqlModule,
    });
  } catch (error) {
    runnerProgress.publish({ status: 'failed', phase: 'failed', message: error?.message ?? String(error) });
    runnerProgress.stop();
    throw error;
  }
  const bundlePath = path.resolve(preview.bundlePath);
  const previewBundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  if (!preview.stableSourceSnapshot) {
    runnerProgress.publish({ status: 'failed', phase: 'source-stability', message: `supplementary ${domain} source was not stable enough to defer acknowledgement` });
    throw new Error(`supplementary ${domain} source was not stable enough to defer acknowledgement`);
  }
  const operationRunId = buildAutomaticRunId(domain, preview.stableSourceSnapshot.contentHash);
  const bundle = buildSupplementaryL1Bundle({
    operationId: previewBundle.operationId,
    runId: operationRunId,
    domainId: previewBundle.domainId,
    generatedAt: previewBundle.generatedAt,
    executionMode: previewBundle.executionMode,
    policy: previewBundle.policy,
    baseline: previewBundle.baseline,
    source: previewBundle.source,
    ownedTables: previewBundle.ownedTables,
    importPlan: {
      ...previewBundle.importPlan,
      automaticSourceFingerprint: preview.stableSourceSnapshot.contentHash,
    },
  });
  writeJsonAtomic(bundlePath, bundle);
  runnerProgress.publish({ status: 'running', phase: 'database-apply', message: `applying frozen ${domain} bundle` });
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  try {
    if (activation.policySetHash !== bundle.policy.policySetHash) {
      throw new Error('scheduler activation policy set does not match frozen supplementary bundle');
    }
    const authorizationContext = {
      operationId: bundle.operationId,
      actor: activation.actor,
      reason: activation.reason,
      authorizationReference: activation.authorizationReference,
      decisionIdentity: activation.decisionIdentity,
      packetHash: activation.packetHash,
      authorizedAt: activation.authorizedAt,
      expiresAt: activation.expiresAt,
      executionMode: 'ACTIVATION_GATED_AUTO',
      activationDecisionIdentity: activation.decisionIdentity,
      activationPacketHash: activation.packetHash,
      activationPolicySetHash: activation.policySetHash,
    };
    const alreadyCommitted = await isCommittedAutomaticRun(connection, {
      runId: operationRunId,
      domainId: domain,
      sourceFingerprint: preview.stableSourceSnapshot.contentHash,
      source: bundle.source,
    });
    const acknowledgeSource = sourceMode === 'live'
      ? async () => acknowledgeSourceImpl({
          manifestPath: args['manifest-path'] ?? DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
          snapshot: preview.stableSourceSnapshot,
          outputPath: bundlePath,
        })
      : async () => {};
    const result = await runImportThenAcknowledge({
      alreadyCommitted,
      executeImport: () => executeOperationImpl({
        adapter: createMysqlSupplementaryL1Adapter(connection, {
          bundlePath,
          repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
        }),
        bundle,
        authorizationContext,
        now,
      }),
      acknowledgeSource,
    });
    runnerProgress.publish({
      status: 'completed',
      phase: alreadyCommitted ? 'acknowledgement-reconciled' : 'completed',
      message: alreadyCommitted ? `reconciled committed ${domain} acknowledgement` : `completed ${domain} automatic operation`,
    });
    const operationResult = alreadyCommitted ? { ...result, domainId: domain, runId: operationRunId } : result;
    return sourceMode === 'live'
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

async function isCommittedAutomaticRun(connection, {
  runId,
  domainId,
  sourceFingerprint,
  source,
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
  if (recordedFingerprint != null && recordedFingerprint !== sourceFingerprint) {
    throw new Error('committed automatic run evidence does not match frozen source');
  }
  const exactFrozenSource = manifest?.source?.path === source.path
    && manifest?.source?.sha256 === source.sha256;
  const derivedRunMatches = runId === buildAutomaticRunId(domainId, sourceFingerprint);
  if (exactFrozenSource || recordedFingerprint === sourceFingerprint && recordedFingerprint != null
      || recordedFingerprint == null && derivedRunMatches) return true;
  throw new Error('committed automatic run evidence does not match frozen source');
}

function writeJsonAtomic(filePath, payload) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function connectionOptions(env) {
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid TERRAPEDIA_DB_PORT');
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') throw new Error('TERRAPEDIA_DB_NAME must be terria_v1_local');
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSupplementaryDomainAutomaticOperation().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`supplementary automatic operation failed: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
