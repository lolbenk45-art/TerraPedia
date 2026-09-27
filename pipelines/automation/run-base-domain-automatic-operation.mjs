#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { runIndependentEntityImport } from '../import/import-independent-entities-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import { resolveSharedDataRoot } from '../lib/project-root.mjs';
import {
  advanceWikiIngestionManifestForSource,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
} from '../lib/wiki-sync-manifest.mjs';
import { finalizeBackendRefreshActionIngestionManifest } from '../workflow/backend-refresh-manifest-finalize.mjs';
import { requireAutoDomainOperation } from './automatic-domain-operation-contract.mjs';
import {
  createMysqlSupplementaryL1Adapter,
  executeSupplementaryL1Operation,
  readCurrentSupplementaryContext,
  assertImportSummaryHealthy,
  readVerifiedCommittedAutomaticBundle,
} from './run-supplementary-domain-l1-operation.mjs';
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';
import { buildAutomaticRunId, runImportThenAcknowledge } from './run-automatic-domain-operation.mjs';
import {
  automaticArtifactRunId,
  automaticAttemptIdentityFromEnvironment,
  automaticReconciliationRoot,
  freezeAutomaticSourceProgressSnapshot,
  assertAutomaticAttemptMatches,
} from './automatic-execution-artifacts.mjs';
import {
  assertCurrentSourceMonitorStateMatchesDispatchIdentity,
  assertFrozenSourceMatchesDispatchIdentity,
  assertFrozenSourceMonitorStateMatches,
  canonicalSourceFingerprint,
  readFrozenSourceMonitorState,
  sourceDispatchIdentityFromEnvironment,
} from './source-dispatch-identity.mjs';
import { createContentHash } from '../lib/wiki-sync-manifest.mjs';
import {
  buildActionProgressPayload,
  createCrawlerAttemptProgressSequencer,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

const BASE_DOMAINS = new Set(['items', 'npcs', 'projectiles', 'armor_sets', 'buffs']);
const SCHEDULER_ACTIVATION_DOMAIN = 'crawler_v2_scheduler';

export async function runBaseDomainAutomaticOperation({
  argv = process.argv.slice(2),
  env = process.env,
  now = null,
  nowProvider = () => new Date().toISOString(),
  mysqlModule = null,
  requireAutoDomainOperationImpl = requireAutoDomainOperation,
  runSourceImpl = runSource,
  readSourceFingerprintImpl = readBaseDomainSourceFingerprint,
  readCurrentContextImpl = readCurrentSupplementaryContext,
  isCommittedRunImpl = readCommittedBaseAutomaticRun,
  createAdapterImpl = createMysqlSupplementaryL1Adapter,
  executeOperationImpl = executeSupplementaryL1Operation,
  acknowledgeSourceImpl = acknowledgeBaseDomainSource,
  readSourceMonitorStateImpl = readFrozenSourceMonitorState,
  externalOutputPlatform = process.platform,
  heartbeatIntervalMs = undefined,
} = {}) {
  const args = parseArgs(argv);
  const startTime = requireTimestamp(now ?? nowProvider(), 'operation start time');
  const domain = requireText(args.domain, '--domain');
  if (args['run-id']) throw new Error('--run-id is not allowed for automatic operations');
  if (!BASE_DOMAINS.has(domain)) throw new Error(`unsupported base automatic domain: ${domain}`);
  if (args.output) assertSecureExternalOutputPublicationSupported({ platform: externalOutputPlatform });
  const sourceDispatchIdentity = sourceDispatchIdentityFromEnvironment(env);
  const automaticAttemptIdentity = automaticAttemptIdentityFromEnvironment(env, sourceDispatchIdentity);
  const config = requireAutoDomainOperationImpl(domain);
  const repoRoot = env.WORKTREE_ROOT ?? process.cwd();
  const sourceStatePath = env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH;
  const frozenProbeState = sourceDispatchIdentity == null
    ? null
    : readSourceMonitorStateImpl({
        identity: sourceDispatchIdentity,
        domain,
        repoRoot,
        sourceStatePath,
      });
  const manifestPath = resolveBaseDomainManifestPath({
    manifestPath: args['manifest-path'],
    repoRoot,
  });
  const crawlRunId = `${domain}_source_${startTime.replace(/\D/g, '').slice(0, 14)}`;
  const progressPath = path.resolve(
    args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? defaultProgressPath(domain),
  );
  const runnerProgress = createBaseRunnerProgress({ progressPath, domain, env, heartbeatIntervalMs });
  const db = mysqlModule ?? loadMysqlModule();
  let connection = null;
  try {
    connection = await db.createConnection(connectionOptions(env));
    const activation = await loadFreshActivation(connection);
    if (!activation) throw new Error(`no fresh scheduler activation for automatic domain: ${domain}`);

    const sourceMode = args['source-mode'] ?? 'live';
    if (!['live', 'local'].includes(sourceMode)) throw new Error('--source-mode must be live or local');
    if (sourceMode === 'live') {
      await runSourceImpl({ domain, progressPath, runId: crawlRunId, env });
      if (automaticAttemptIdentity != null) {
        readCompletedBaseSourceProgressTimestamp({ repoRoot, progressPath, automaticAttemptIdentity });
      }
    } else {
      runnerProgress.publish({ status: 'running', phase: 'local-frozen-source', runId: crawlRunId });
    }
    runnerProgress.publish({ status: 'completed', phase: 'source-completed', runId: crawlRunId });
    const sourceCheckedAt = readCompletedBaseSourceProgressTimestamp({ repoRoot, progressPath });
    const sourceFingerprint = canonicalSourceFingerprint(readSourceFingerprintImpl(domain));
    assertFrozenSourceMonitorStateMatches(sourceDispatchIdentity, frozenProbeState);
    assertFrozenSourceMatchesDispatchIdentity(sourceDispatchIdentity, sourceFingerprint);
    const { runId, frozen } = freezeBaseAutomaticInput({
      domain, sourceFingerprint, repoRoot, sourceDispatchIdentity, automaticAttemptIdentity,
    });
    const outputPath = resolveBaseAutomaticResultOutputPath({
      outputPath: args.output,
      artifactRoot: frozen.artifactPaths.root,
      repoRoot,
    });

    const alreadyCommitted = await isCommittedRunImpl(connection, {
      runId,
      domainId: domain,
      sourceFingerprint,
      source: frozen.source,
      sourceDispatchIdentity,
    });
    if (alreadyCommitted) {
      let committedArtifactRoot = frozen.artifactPaths.root;
      if (sourceDispatchIdentity != null) {
        const original = readVerifiedCommittedAutomaticBundle({
          repoRoot, manifest: alreadyCommitted, runId, domainId: domain, sourceDispatchIdentity,
        });
        if (original.bundle.source.sha256 !== frozen.source.sha256) {
          throw new Error('committed automatic source does not match the fresh frozen source');
        }
        const current = await readCurrentContextImpl(connection, { bundle: original.bundle });
        if (original.bundle.policy.policySetHash !== activation.policySetHash
            || original.bundle.policy.policySetHash !== current.policySetHash
            || original.bundle.policy.policyHash !== current.policyHash
            || original.bundle.policy.policyVersion !== current.policyVersion
            || current.currentLevel !== 'L2' || current.operationalState !== 'ACTIVE'
            || !isDeepStrictEqual(original.bundle.policy.policyJson, current.policyJson)
            || !isDeepStrictEqual(original.bundle.ownedTables, current.ownedTables)) {
          throw new Error('committed automatic bundle policy does not match current policy');
        }
        committedArtifactRoot = path.dirname(original.bundlePath);
      }
      const result = await runImportThenAcknowledge({
        alreadyCommitted: true,
        executeImport: async () => { throw new Error('committed automatic run must not execute import'); },
        acknowledgeSource: async () => acknowledgeBaseDomainSourceWithFreshActivation({
          connection, initialActivation: activation, startTime, sourceCheckedAt, nowProvider,
          sourceMode, domain, repoRoot, manifestPath, acknowledgeSourceImpl, sourceDispatchIdentity,
          sourceStatePath, readSourceMonitorStateImpl, readSourceFingerprintImpl,
        }),
      });
      runnerProgress.publish({ status: 'completed', phase: 'acknowledgement-reconciled', runId });
      const completedResult = withBaseSourceAcknowledgement({ ...result, domainId: domain, runId }, sourceMode);
      if (outputPath) writeBaseAutomaticResultOutput({
        outputPath,
        artifactRoot: committedArtifactRoot,
        repoRoot: frozen.artifactPaths.repoRoot,
        payload: completedResult,
        requireProtectedArtifactIdentity: true,
      });
      return completedResult;
    }

    if (config.databaseMode === 'DRY_RUN') {
      const artifactPaths = reserveBaseAutomaticArtifactDirectory({ repoRoot, frozen });
      writeBaseAutomaticArtifacts({ frozen, artifactPaths });
      runnerProgress.publish({ status: 'running', phase: 'database-dry-run', runId });
      const importSummary = domain === 'items'
        ? validateItemDryRunDataset(frozen.datasets.items)
        : await runIndependentEntityImport({
            apply: 'false',
            entity: domain,
          }, { mysqlModule: db, datasets: frozen.datasets });
      assertImportSummaryHealthy(importSummary);
      const result = { schemaVersion: 1, domainId: domain, runId, status: 'completed', databaseMode: 'DRY_RUN', importSummary };
      await acknowledgeBaseDomainSourceWithFreshActivation({
        connection, initialActivation: activation, startTime, sourceCheckedAt, nowProvider,
        sourceMode, domain, repoRoot, manifestPath, acknowledgeSourceImpl, sourceDispatchIdentity,
        sourceStatePath, readSourceMonitorStateImpl, readSourceFingerprintImpl,
      });
      const completedResult = withBaseSourceAcknowledgement(result, sourceMode);
      if (outputPath) writeBaseAutomaticResultOutput({
        outputPath,
        artifactRoot: frozen.artifactPaths.root,
        repoRoot: frozen.artifactPaths.repoRoot,
        payload: completedResult,
        requireProtectedArtifactIdentity: true,
      });
      runnerProgress.publish({ status: 'completed', phase: 'dry-run-completed', runId });
      return completedResult;
    }

    const artifactPaths = reserveBaseAutomaticArtifactDirectory({ repoRoot, frozen });
    const sourceProgressSnapshotPath = freezeBaseSourceProgressSnapshot({
      repoRoot,
      domain,
      runId,
      progressPath,
      sourceDispatchIdentity,
      automaticAttemptIdentity,
    });
    const frozenSourceCheckedAt = readCompletedBaseSourceProgressTimestamp({
      repoRoot,
      progressPath: sourceProgressSnapshotPath,
    });
    if (frozenSourceCheckedAt !== sourceCheckedAt) {
      throw new Error('source progress timestamp drifted before automatic database apply');
    }

    const current = await readCurrentContextImpl(connection, {
      bundle: {
        domainId: domain,
        ownedTables: config.ownedTables,
        executionMode: 'ACTIVATION_GATED_AUTO',
      },
    });
    if (activation.policySetHash !== current.policySetHash) {
      throw new Error('scheduler activation policy set does not match current policy set');
    }
    const bundle = buildBaseAutomaticBundle({
      domain,
      config,
      current,
      runId,
      generatedAt: startTime,
      frozen,
      sourceFingerprint,
      sourceCheckedAt: frozenSourceCheckedAt,
      sourceDispatchIdentity,
      reconciliationInput: buildReconciliationInputFromArgs(args)
        ?? buildAutomaticReconciliationInput(domain, runId, { sourceDispatchIdentity, importPlan: frozen.importPlan }),
    });
    writeBaseAutomaticArtifacts({ frozen, bundle, artifactPaths });
    runnerProgress.publish({ status: 'running', phase: 'database-apply', runId });
    const { activation: latestActivation, executionTime } = await loadFreshActivationForMutation({
      connection, initialActivation: activation, startTime, sourceCheckedAt: frozenSourceCheckedAt, nowProvider,
    });
    const result = await executeOperationImpl({
      adapter: createAdapterImpl(connection, {
        bundlePath: frozen.bundlePath,
        progressPath: sourceProgressSnapshotPath,
        repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
      }),
      bundle,
      authorizationContext: activationContext(latestActivation, bundle.operationId),
      now: executionTime,
    });
    await acknowledgeBaseDomainSourceWithFreshActivation({
      connection, initialActivation: activation, startTime, sourceCheckedAt: frozenSourceCheckedAt, nowProvider,
      sourceMode, domain, repoRoot, manifestPath, acknowledgeSourceImpl, sourceDispatchIdentity,
      sourceStatePath, readSourceMonitorStateImpl, readSourceFingerprintImpl,
    });
    const completedResult = withBaseSourceAcknowledgement(result, sourceMode);
    if (outputPath) writeBaseAutomaticResultOutput({
      outputPath,
      artifactRoot: frozen.artifactPaths.root,
      repoRoot: frozen.artifactPaths.repoRoot,
      payload: completedResult,
      requireProtectedArtifactIdentity: true,
    });
    runnerProgress.publish({ status: 'completed', phase: 'completed', runId });
    return completedResult;
  } catch (error) {
    if (runnerProgress) {
      runnerProgress.publish({ status: 'failed', phase: 'failed', message: error?.message ?? String(error) });
    }
    throw error;
  } finally {
    runnerProgress?.stop();
    await connection?.end();
  }
}

export function resolveBaseDomainManifestPath({ manifestPath, repoRoot }) {
  return path.resolve(repoRoot, manifestPath ?? 'data/generated/wiki-source-manifest.latest.json');
}

export function buildReconciliationInputFromArgs(args = {}) {
  const keys = ['source-coverage', 'table-readback', 'attempt-state', 'reconciliation-output'];
  const present = keys.filter((key) => args[key] != null);
  if (present.length === 0) return undefined;
  if (present.length !== keys.length) {
    throw new Error('full reconciliation requires --source-coverage, --table-readback, --attempt-state, and --reconciliation-output together');
  }
  return {
    sourceCoveragePath: args['source-coverage'],
    ownedTableReadbackPath: args['table-readback'],
    attemptStatePath: args['attempt-state'],
    outputPath: args['reconciliation-output'],
  };
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

export function buildBaseAutomaticBundle({
  domain,
  config,
  current,
  runId,
  generatedAt,
  frozen,
  sourceFingerprint,
  sourceCheckedAt,
  sourceDispatchIdentity = null,
  reconciliationInput,
} = {}) {
  const domainId = requireText(domain, 'domain');
  if (!config?.operationId) throw new Error('base automatic operation config is required');
  if (!current?.policyJson || !Array.isArray(current.ownedTables) || current.ownedTables.length === 0) {
    throw new Error('base automatic operation requires current scoped L2 policy ownership');
  }
  return buildSupplementaryL1Bundle({
    operationId: config.operationId,
    runId: requireText(runId, 'runId'),
    domainId,
    generatedAt: requireText(generatedAt, 'generatedAt'),
    executionMode: 'ACTIVATION_GATED_AUTO',
    policy: {
      domainId,
      level: current.currentLevel,
      operationalState: current.operationalState,
      policyVersion: current.policyVersion,
      policyHash: current.policyHash,
      policySetHash: current.policySetHash,
      policyJson: current.policyJson,
    },
    baseline: current.baseline,
    source: frozen?.source,
    ownedTables: current.ownedTables,
    importPlan: {
      ...frozen?.importPlan,
      automaticSourceFingerprint: requireText(sourceFingerprint, 'sourceFingerprint'),
      sourceCheckedAt: requireTimestamp(sourceCheckedAt, 'sourceCheckedAt'),
    },
    ...(sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity }),
    reconciliationInput,
  });
}

export function freezeBaseSourceProgressSnapshot({
  repoRoot, domain, runId, progressPath, sourceDispatchIdentity = null, automaticAttemptIdentity = null,
} = {}) {
  return freezeAutomaticSourceProgressSnapshot({
    repoRoot: path.resolve(requireText(repoRoot, 'repoRoot')),
    progressPath: requireText(progressPath, 'progressPath'),
    binding: { domainId: domain, runId, sourceDispatchIdentity, importPlan: { automaticAttemptIdentity } },
  });
}

export function readCompletedBaseSourceProgressTimestamp({ repoRoot, progressPath, automaticAttemptIdentity = null } = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const sourcePath = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: requireText(progressPath, 'progressPath'),
    label: 'source progress',
  });
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  assertAutomaticAttemptMatches(payload, automaticAttemptIdentity, 'source progress');
  if (String(payload?.status ?? '').toLowerCase() !== 'completed') {
    throw new Error('source progress must be terminal before automatic diff preview');
  }
  return requireTimestamp(payload?.generatedAt, 'source progress generatedAt');
}

export function freezeBaseAutomaticInput({
  domain,
  sourceFingerprint,
  repoRoot,
  sourceDispatchIdentity = null,
  automaticAttemptIdentity = null,
  freezeInputImpl = freezeStandardizedInput,
}) {
  const runId = buildAutomaticRunId(domain, sourceFingerprint);
  return {
    runId,
    frozen: freezeInputImpl({ domain, runId, repoRoot, sourceDispatchIdentity, automaticAttemptIdentity }),
  };
}

export async function isCommittedBaseAutomaticRun(connection, options) {
  return Boolean(await readCommittedBaseAutomaticRun(connection, options));
}

export async function readCommittedBaseAutomaticRun(connection, {
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
  if (recordedFingerprint != null && recordedFingerprint !== sourceFingerprint) {
    throw new Error('committed automatic run evidence does not match frozen source');
  }
  if (sourceDispatchIdentity != null
      && !sameSourceDispatchIdentity(manifest?.sourceDispatchIdentity, sourceDispatchIdentity)) {
    throw new Error('committed automatic run evidence does not match the scheduler source dispatch identity');
  }
  const exactFrozenSource = manifest?.source?.path === source.path
    && manifest?.source?.sha256 === source.sha256;
  const derivedRunMatches = runId === buildAutomaticRunId(domainId, sourceFingerprint);
  if (exactFrozenSource || recordedFingerprint === sourceFingerprint && recordedFingerprint != null
      || recordedFingerprint == null && derivedRunMatches) return manifest;
  throw new Error('committed automatic run evidence does not match frozen source');
}

function sameSourceDispatchIdentity(actual, expected) {
  return actual != null
    && actual.sourceFingerprint === expected.sourceFingerprint
    && actual.sourceRunIdentity === expected.sourceRunIdentity
    && actual.sourceContentIdentity === expected.sourceContentIdentity;
}

function runSource({ domain, progressPath, env }) {
  const [script, ...args] = buildBaseDomainSourceCommand(domain, progressPath);
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = spawnSync(process.execPath, [path.resolve(sourceRoot, script), ...args], {
    cwd: env.WORKTREE_ROOT ?? process.cwd(),
    env: { ...env, TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath },
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${domain} source operation failed with exit ${result.status}`);
}

export function buildBaseDomainSourceCommand(domain, progressPath) {
  if (['items', 'npcs', 'projectiles'].includes(domain)) {
    const stagingRoot = path.dirname(progressPath);
    return [
      'pipelines/workflow/run-wiki-sync.mjs',
      '--mode=apply',
      '--force=true',
      `--entity=${domain}`,
      `--manifest-path=${path.join(stagingRoot, `${domain}-source-manifest.staging.json`)}`,
      `--plan-path=${path.join(stagingRoot, `${domain}-wiki-sync-plan.staging.json`)}`,
    ];
  }
  if (domain === 'buffs') {
    return ['pipelines/fetch/fetch-wiki-buffs.mjs', `--progress-path=${progressPath}`];
  }
  if (domain === 'armor_sets') {
    return ['pipelines/fetch/fetch-wiki-armorsetbonuses.mjs', `--progress-path=${progressPath}`];
  }
  throw new Error(`unsupported base automatic source domain: ${domain}`);
}

export function acknowledgeBaseDomainSource({
  domain,
  repoRoot,
  manifestPath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  sourceDispatchIdentity = null,
  validatedSourceFingerprint = null,
}) {
  if (sourceDispatchIdentity != null) {
    const currentFingerprint = validatedSourceFingerprint == null
      ? readBaseDomainSourceFingerprint(domain)
      : canonicalSourceFingerprint(validatedSourceFingerprint);
    assertFrozenSourceMatchesDispatchIdentity(sourceDispatchIdentity, currentFingerprint);
  }
  if (['items', 'npcs', 'projectiles'].includes(domain)) {
    return finalizeBackendRefreshActionIngestionManifest({
      actionId: actionId(domain),
      manifestPath,
      sharedDataRoot: resolveSharedDataRoot(),
      worktreeRoot: repoRoot,
    });
  }
  const source = domain === 'buffs'
    ? {
        sourceKey: 'wiki.page.template_getbuffinfo',
        locator: 'Template:GetBuffInfo',
        entityFamily: 'buffs',
        sourceKind: 'template',
        outputPath: resolveSharedDataRoot('raw', 'wiki', 'template__getbuffinfo.latest.json'),
      }
    : {
        sourceKey: 'wiki.module.armorsetbonuses',
        locator: 'Module:ArmorSetBonuses',
        entityFamily: 'armor_sets',
        sourceKind: 'module',
        outputPath: resolveSharedDataRoot('raw', 'wiki', 'module__armorsetbonuses.latest.json'),
      };
  return advanceWikiIngestionManifestForSource({ ...source, manifestPath });
}

async function acknowledgeBaseDomainSourceIfLive({
  sourceMode,
  domain,
  repoRoot,
  manifestPath,
  sourceDispatchIdentity = null,
  validatedSourceFingerprint = null,
  acknowledgeSourceImpl = acknowledgeBaseDomainSource,
}) {
  if (sourceMode !== 'live') return;
  return await acknowledgeSourceImpl({
    domain,
    repoRoot,
    manifestPath,
    sourceDispatchIdentity,
    validatedSourceFingerprint,
  });
}

async function acknowledgeBaseDomainSourceWithFreshActivation({
  connection,
  initialActivation,
  startTime,
  sourceCheckedAt,
  nowProvider,
  sourceDispatchIdentity = null,
  readSourceFingerprintImpl = readBaseDomainSourceFingerprint,
  ...acknowledgement
}) {
  if (acknowledgement.sourceMode !== 'live') return;
  assertCurrentSourceMonitorStateMatchesDispatchIdentity({
    identity: sourceDispatchIdentity,
    domain: acknowledgement.domain,
    repoRoot: acknowledgement.repoRoot,
    sourceStatePath: acknowledgement.sourceStatePath,
    readSourceMonitorStateImpl: acknowledgement.readSourceMonitorStateImpl,
  });
  const validatedSourceFingerprint = sourceDispatchIdentity == null
    ? null
    : canonicalSourceFingerprint(readSourceFingerprintImpl(acknowledgement.domain));
  if (validatedSourceFingerprint != null) {
    assertFrozenSourceMatchesDispatchIdentity(sourceDispatchIdentity, validatedSourceFingerprint);
  }
  await loadFreshActivationForMutation({
    connection,
    initialActivation,
    startTime,
    sourceCheckedAt,
    nowProvider,
  });
  return await acknowledgeBaseDomainSourceIfLive({
    ...acknowledgement,
    sourceDispatchIdentity,
    validatedSourceFingerprint,
  });
}

function withBaseSourceAcknowledgement(result, sourceMode) {
  return sourceMode === 'live'
    ? result
    : {
        ...result,
        sourceAcknowledged: false,
        sourceAcknowledgementReason: 'local_source_not_acknowledged',
      };
}

export function validateItemDryRunDataset(dataset) {
  const records = Array.isArray(dataset?.records) ? dataset.records : null;
  if (!records) throw new Error('standardized Items dataset records are required');
  const ids = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const valid = record && typeof record === 'object'
      && Number.isSafeInteger(record.id) && record.id > 0 && !ids.has(record.id)
      && typeof record.internalName === 'string' && record.internalName.trim()
      && typeof record.name === 'string' && record.name.trim()
      && record.stats && typeof record.stats === 'object' && !Array.isArray(record.stats)
      && record.stack && typeof record.stack === 'object' && !Array.isArray(record.stack);
    if (!valid) throw new Error(`invalid standardized item record at index ${index}`);
    ids.add(record.id);
  }
  return { input: records.length, validated: records.length, mutations: 0 };
}

export function readBaseDomainSourceFingerprint(domain) {
  const fileNames = {
    items: 'module__iteminfo__data.latest.json',
    npcs: 'module__npcinfo__data.latest.json',
    projectiles: 'module__projectileinfo__data.latest.json',
    buffs: 'template__getbuffinfo.latest.json',
    armor_sets: 'module__armorsetbonuses.latest.json',
  };
  const fileName = fileNames[domain];
  if (!fileName) throw new Error(`unsupported base source fingerprint domain: ${domain}`);
  const payload = JSON.parse(fs.readFileSync(resolveSharedDataRoot('raw', 'wiki', fileName), 'utf8'));
  const moduleContent = typeof payload.moduleContent === 'string' ? payload.moduleContent : null;
  if (!moduleContent?.trim()) throw new Error(`${domain} source output is missing moduleContent`);
  return `sha256:${createContentHash(moduleContent)}`;
}

function freezeStandardizedInput({ domain, runId, repoRoot, sourceDispatchIdentity, automaticAttemptIdentity }) {
  const datasets = {};
  for (const entity of new Set([domain, 'items'])) {
    const filePath = path.join(repoRoot, 'data', 'standardized', `${entity}.standardized.json`);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (payload.entity !== entity || !Array.isArray(payload.records)) {
      throw new Error(`standardized ${entity} dataset is invalid`);
    }
    datasets[entity] = payload;
  }
  const payload = { schemaVersion: 1, domainId: domain, runId, datasets };
  const artifactPaths = buildBaseAutomaticArtifactPaths({
    repoRoot, domain, runId, sourceDispatchIdentity, importPlan: { automaticAttemptIdentity },
  });
  return {
    source: { path: artifactPaths.sourceRelativePath, sha256: hashFrozenSourcePayload(payload) },
    sourcePayload: payload,
    bundlePath: artifactPaths.bundlePath,
    artifactPaths,
    datasets,
    importPlan: {
      entity: domain,
      recordCount: datasets[domain].records.length,
      itemDependencyCount: datasets.items.records.length,
      ...(automaticAttemptIdentity == null ? {} : { automaticAttemptIdentity }),
    },
  };
}

export function buildBaseAutomaticArtifactPaths({ repoRoot, domain, runId, sourceDispatchIdentity, importPlan } = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const domainId = requireBaseAutomaticArtifactDomain(domain);
  const automaticRunId = requireBaseAutomaticArtifactRunId(runId, domainId);
  const relativeRoot = path.posix.join(
    'reports',
    'authorization',
    'canonical',
    'automatic',
    domainId,
    automaticArtifactRunId({ runId: automaticRunId, sourceDispatchIdentity, importPlan }),
  );
  const artifactRoot = path.resolve(root, relativeRoot);
  return Object.freeze({
    repoRoot: root,
    domainId,
    runId: automaticRunId,
    relativeRoot,
    root: artifactRoot,
    sourceRelativePath: `${relativeRoot}/source.json`,
    sourcePath: path.join(artifactRoot, 'source.json'),
    bundlePath: path.join(artifactRoot, 'bundle.json'),
  });
}

function reserveBaseAutomaticArtifactDirectory({ repoRoot, frozen } = {}) {
  const artifactPaths = frozen?.artifactPaths;
  if (!artifactPaths || path.resolve(requireText(repoRoot, 'repoRoot')) !== artifactPaths.repoRoot) {
    throw new Error('base automatic artifact paths must match the repository root');
  }
  assertSecureBaseAutomaticArtifactPublicationSupported();
  const artifactRoot = artifactPaths.root;
  const parentRoot = path.dirname(artifactRoot);
  const parentBinding = bindBaseAutomaticDirectory({
    repoRoot: artifactPaths.repoRoot,
    directoryPath: parentRoot,
    createParent: true,
  });
  let artifactFd = null;
  try {
    assertBaseAutomaticDirectoryIdentityAtPath(parentRoot, parentBinding.identity);
    const childPath = path.join(descriptorDirectoryPathFor(parentBinding.directoryFd), path.basename(artifactRoot));
    try {
      fs.mkdirSync(childPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(`base automatic artifact directory already exists; overwrite is forbidden: ${artifactRoot}`);
      }
      throw error;
    }
    fs.fsyncSync(parentBinding.directoryFd);
    artifactFd = openBaseDirectoryAtPath(childPath);
    const artifactStat = fs.fstatSync(artifactFd);
    assertPrivateBaseAutomaticDirectory(artifactStat, 'base automatic artifact directory');
    assertCanonicalBaseAutomaticDirectoryPath(artifactRoot, 'base automatic artifact directory');
    assertBaseAutomaticDirectoryIdentityAtPath(parentRoot, parentBinding.identity);
    return Object.freeze({
      ...artifactPaths,
      root: artifactRoot,
      sourcePath: path.join(artifactRoot, 'source.json'),
      bundlePath: path.join(artifactRoot, 'bundle.json'),
      identity: Object.freeze({ dev: artifactStat.dev, ino: artifactStat.ino }),
    });
  } finally {
    if (artifactFd != null) fs.closeSync(artifactFd);
    fs.closeSync(parentBinding.directoryFd);
  }
}

function writeBaseAutomaticArtifacts({ frozen, bundle = null, artifactPaths } = {}) {
  if (!artifactPaths || frozen?.artifactPaths?.root !== artifactPaths.root
      || frozen.artifactPaths.repoRoot !== artifactPaths.repoRoot) {
    throw new Error('base automatic artifact paths must be reserved before publication');
  }
  const binding = bindBaseAutomaticDirectory({
    repoRoot: artifactPaths.repoRoot,
    directoryPath: artifactPaths.root,
  });
  try {
    if (!sameBaseFileIdentity(binding.identity, artifactPaths.identity)) {
      throw new Error('base automatic artifact directory identity changed or is unavailable');
    }
    writeBasePrivateJsonNoOverwrite(binding.directoryFd, 'source.json', frozen.sourcePayload, 'base automatic source artifact');
    if (bundle != null) {
      writeBasePrivateJsonNoOverwrite(binding.directoryFd, 'bundle.json', bundle, 'base automatic bundle artifact');
    }
    assertBaseAutomaticDirectoryIdentityAtPath(artifactPaths.root, binding.identity);
  } finally {
    fs.closeSync(binding.directoryFd);
  }
}

function writeBasePrivateJsonNoOverwrite(directoryFd, fileName, payload, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName)) {
    throw new Error(`${label} must name a safe file`);
  }
  const directoryPath = descriptorDirectoryPathFor(directoryFd);
  const temporaryPath = path.join(directoryPath, `.${fileName}.${process.pid}.${randomBytes(16).toString('hex')}.tmp`);
  let temporaryFd = null;
  try {
    temporaryFd = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(temporaryFd, serializeFrozenSourcePayload(payload));
    fs.fchmodSync(temporaryFd, 0o600);
    fs.fsyncSync(temporaryFd);
    const staged = fs.fstatSync(temporaryFd);
    assertPrivateBaseAutomaticFile(staged, `${label} staged artifact`);
    fs.closeSync(temporaryFd);
    temporaryFd = null;
    const destinationPath = path.join(directoryPath, fileName);
    fs.linkSync(temporaryPath, destinationPath);
    let destinationFd = null;
    try {
      destinationFd = fs.openSync(destinationPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const destination = fs.fstatSync(destinationFd);
      assertPrivateBaseAutomaticFile(destination, label);
      if (!sameBaseFileIdentity(staged, destination) || destination.size !== staged.size) {
        throw new Error(`${label} identity or byte length changed during publication`);
      }
    } finally {
      if (destinationFd != null) fs.closeSync(destinationFd);
    }
    fs.unlinkSync(temporaryPath);
    fs.fsyncSync(directoryFd);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`${label} already exists; overwrite is forbidden: ${path.join(directoryPath, fileName)}`);
    }
    throw error;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    try { fs.unlinkSync(temporaryPath); } catch {}
  }
}

function assertSecureBaseAutomaticArtifactPublicationSupported() {
  if (process.platform !== 'linux'
      || typeof process.getuid !== 'function'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure base automatic artifact publication is unavailable on this platform');
  }
}

function bindBaseAutomaticDirectory({ repoRoot, directoryPath, createParent = false } = {}) {
  assertSecureBaseAutomaticArtifactPublicationSupported();
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const target = path.resolve(requireText(directoryPath, 'base automatic artifact directory'));
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('base automatic artifact directory must remain inside the repository');
  }
  assertCanonicalBaseAutomaticDirectoryPath(root, 'repository root');
  let directoryFd = openBaseDirectoryAtPath(root);
  try {
    assertPrivateBaseAutomaticDirectory(fs.fstatSync(directoryFd), 'repository root');
    let current = root;
    for (const segment of relative.split(path.sep)) {
      const childPath = path.join(descriptorDirectoryPathFor(directoryFd), segment);
      let childFd;
      try {
        childFd = openBaseDirectoryAtPath(childPath);
      } catch (error) {
        if (error?.code !== 'ENOENT' || !createParent) throw baseAutomaticArtifactDirectoryError(error);
        fs.mkdirSync(childPath, { mode: 0o700 });
        childFd = openBaseDirectoryAtPath(childPath);
      }
      fs.closeSync(directoryFd);
      directoryFd = childFd;
      current = path.join(current, segment);
      assertPrivateBaseAutomaticDirectory(fs.fstatSync(directoryFd), 'base automatic artifact ancestor');
      assertCanonicalBaseAutomaticDirectoryPath(current, 'base automatic artifact ancestor');
    }
    const identity = fs.fstatSync(directoryFd);
    return Object.freeze({ directoryFd, identity: Object.freeze({ dev: identity.dev, ino: identity.ino }) });
  } catch (error) {
    fs.closeSync(directoryFd);
    throw baseAutomaticArtifactDirectoryError(error);
  }
}

function openBaseDirectoryAtPath(directoryPath) {
  return fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

function assertCanonicalBaseAutomaticDirectoryPath(directoryPath, label) {
  const target = path.resolve(directoryPath);
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
  if (path.resolve(fs.realpathSync(target)) !== target) {
    throw new Error(`${label} must be a canonical ordinary directory`);
  }
  return stat;
}

function assertPrivateBaseAutomaticDirectory(stat, label) {
  if (!stat?.isDirectory?.() || stat.isSymbolicLink?.()
      || Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o022) !== 0) {
    throw new Error(`${label} must be owned by the automation service UID and not group/other writable`);
  }
}

function assertPrivateBaseAutomaticFile(stat, label) {
  if (!stat?.isFile?.() || stat.isSymbolicLink?.()
      || Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} must be an ordinary private 0600 file owned by the automation service UID`);
  }
}

function assertBaseAutomaticDirectoryIdentityAtPath(directoryPath, expectedIdentity) {
  const currentFd = openBaseDirectoryAtPath(directoryPath);
  try {
    const current = fs.fstatSync(currentFd);
    if (!sameBaseFileIdentity(current, expectedIdentity)) {
      throw new Error('base automatic artifact directory identity changed or is unavailable');
    }
  } finally {
    fs.closeSync(currentFd);
  }
}

function sameBaseFileIdentity(left, right) {
  return left != null && right != null && left.dev === right.dev && left.ino === right.ino;
}

function baseAutomaticArtifactDirectoryError(error) {
  if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
    return new Error('base automatic artifact directory identity changed or is unavailable', { cause: error });
  }
  return error;
}

async function loadFreshActivation(connection) {
  const [rows] = await connection.query(
    'SELECT decision_identity AS decisionIdentity, packet_hash AS packetHash,'
    + ' policy_set_hash AS policySetHash, actor, reason, authorization_reference AS authorizationReference,'
    + ' authorized_at AS authorizedAt, expires_at AS expiresAt'
    + ' FROM crawler_automation_activation_decision WHERE decision_kind = ? AND domain_id = ?'
    + ' AND authorized_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP'
    + ' ORDER BY authorized_at DESC, id DESC LIMIT 1',
    ['SCHEDULER_ACTIVATION', SCHEDULER_ACTIVATION_DOMAIN],
  );
  return rows?.[0] ?? null;
}

async function loadFreshActivationForMutation({
  connection,
  initialActivation,
  startTime,
  sourceCheckedAt,
  nowProvider,
}) {
  const activation = await loadFreshActivation(connection);
  assertActivationUnchanged(initialActivation, activation);
  const executionTime = maxBaseAutomaticExecutionTime(
    startTime,
    sourceCheckedAt,
    nowProvider(),
  );
  assertActivationValidAt(activation, executionTime);
  return { activation, executionTime };
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

function activationContext(activation, operationId) {
  return {
    operationId,
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
}

function defaultProgressPath(domain) {
  if (domain === 'buffs') return 'data/generated/fetch-wiki-buffs-progress.latest.json';
  if (domain === 'armor_sets') return 'data/generated/domain-source-armor-sets-progress.latest.json';
  return `data/generated/domain-source-${domain.replaceAll('_', '-')}-progress.latest.json`;
}

export function createBaseRunnerProgress({ progressPath, domain, env = process.env, heartbeatIntervalMs }) {
  const resolvedProgressPath = path.resolve(progressPath);
  const sequencer = createCrawlerAttemptProgressSequencer(env);
  const heartbeat = createCrawlerProgressHeartbeat({
    ...(heartbeatIntervalMs == null ? {} : { intervalMs: heartbeatIntervalMs }),
    writeProgress(payload) {
      writeJsonFile(resolvedProgressPath, sequencer.next(payload, {
        observedProgressSequence: readProgressSequence(resolvedProgressPath),
      }));
    },
  });
  return {
    publish({ status, phase, runId = null, message = null }) {
      const timestamp = new Date().toISOString();
      heartbeat.publish({
        ...buildActionProgressPayload({
          actionId: actionId(domain),
          status,
          generatedAt: timestamp,
          lastHeartbeatAt: timestamp,
          childStatusPath: resolvedProgressPath,
          phase,
          message: message ?? phase,
          current: status === 'completed' ? 1 : 0,
          total: 1,
        }),
        runId,
      });
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

function actionId(domain) {
  return ({ items: 'wiki-items-refresh', npcs: 'wiki-npcs-refresh', projectiles: 'wiki-projectiles-refresh', buffs: 'buff-page-immunity-refresh', armor_sets: 'domain-source-armor-sets' })[domain];
}

function connectionOptions(env) {
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid TERRAPEDIA_DB_PORT');
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') throw new Error('TERRAPEDIA_DB_NAME must be terria_v1_local');
  return { host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'), port, user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'), password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'), database: 'terria_v1_local', multipleStatements: false, dateStrings: true };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length ? rest.join('=') : 'true'];
  }));
}

export function serializeFrozenSourcePayload(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function hashFrozenSourcePayload(value) {
  return `sha256:${createHash('sha256').update(serializeFrozenSourcePayload(value)).digest('hex')}`;
}

function resolveBaseAutomaticResultOutputPath({ outputPath, artifactRoot, repoRoot } = {}) {
  if (!outputPath) return null;
  const resolvedOutputPath = path.resolve(outputPath);
  assertOutputPathHasNoSymbolicLinkAncestor(resolvedOutputPath);
  const protectedArtifactRoot = path.resolve(requireText(artifactRoot, 'base automatic artifact root'));
  if (pathsOverlap(resolvedOutputPath, protectedArtifactRoot)) {
    throw new Error('--output must not overlap the protected base automatic artifact directory');
  }
  assertOutputOutsideImmutableArtifactRoots({ outputPath: resolvedOutputPath, repoRoot });
  return resolvedOutputPath;
}

function assertOutputOutsideImmutableArtifactRoots({ outputPath, repoRoot }) {
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  for (const relativeRoot of ['reports/authorization/canonical/automatic', 'reports/runtime/l1-reconciliation']) {
    if (pathsOverlap(path.resolve(outputPath), path.resolve(root, relativeRoot))) {
      throw new Error('--output must not overlap immutable automatic or reconciliation artifacts');
    }
  }
}

function writeBaseAutomaticResultOutput({
  outputPath,
  artifactRoot,
  repoRoot,
  payload,
  requireProtectedArtifactIdentity = false,
} = {}) {
  const protectedArtifact = requireProtectedArtifactIdentity
    ? bindProtectedBaseAutomaticArtifactDirectory({ repoRoot, artifactRoot })
    : null;
  try {
    const confinedOutputPath = resolveBaseAutomaticResultOutputPath({ outputPath, artifactRoot, repoRoot });
    writeBoundExternalJsonAtomic({
      outputPath: confinedOutputPath,
      protectedArtifact,
      repoRoot,
      payload,
    });
  } finally {
    if (protectedArtifact) fs.closeSync(protectedArtifact.directoryFd);
  }
}

function assertOutputPathHasNoSymbolicLinkAncestor(outputPath) {
  const outputDirectory = path.dirname(outputPath);
  const filesystemRoot = path.parse(outputDirectory).root;
  let current = filesystemRoot;
  for (const segment of path.relative(filesystemRoot, outputDirectory).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error('--output must not have a symbolic-link ancestor');
    }
    if (!stat.isDirectory()) {
      throw new Error('--output must have only directory ancestors');
    }
  }
}

function pathsOverlap(leftPath, rightPath) {
  return isSameOrDescendant(leftPath, rightPath) || isSameOrDescendant(rightPath, leftPath);
}

function isSameOrDescendant(candidatePath, ancestorPath) {
  const relativePath = path.relative(ancestorPath, candidatePath);
  return relativePath === ''
    || (!relativePath.startsWith(`..${path.sep}`)
      && relativePath !== '..'
      && !path.isAbsolute(relativePath));
}

function writeBoundExternalJsonAtomic({ outputPath, protectedArtifact = null, repoRoot, payload } = {}) {
  assertSecureExternalOutputPublicationSupported();
  const outputDirectory = path.dirname(outputPath);
  const outputName = path.basename(outputPath);
  if (!outputName || outputName === '.' || outputName === '..') {
    throw new Error('--output must name a file');
  }

  const directoryFd = openBoundOutputDirectory(outputDirectory);
  let temporaryPath = null;
  let temporaryFd = null;
  try {
    if (protectedArtifact) {
      assertProtectedBaseAutomaticArtifactIdentity(protectedArtifact);
      assertBoundOutputDirectoryDoesNotOverlapArtifact({ directoryFd, protectedArtifact });
    }
    const descriptorDirectoryPath = descriptorDirectoryPathFor(directoryFd);
    assertOutputOutsideImmutableArtifactRoots({
      outputPath: path.join(fs.realpathSync(descriptorDirectoryPath), outputName),
      repoRoot,
    });
    const destinationPath = path.join(descriptorDirectoryPath, outputName);
    ({ temporaryPath, temporaryFd } = createBoundOutputTemporaryFile({
      descriptorDirectoryPath,
      outputName,
    }));
    fs.writeFileSync(temporaryFd, `${JSON.stringify(payload, null, 2)}\n`);
    fs.fchmodSync(temporaryFd, 0o600);
    fs.closeSync(temporaryFd);
    temporaryFd = null;
    fs.renameSync(temporaryPath, destinationPath);
    temporaryPath = null;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    if (temporaryPath != null) fs.rmSync(temporaryPath, { force: true });
    fs.closeSync(directoryFd);
  }
}

function assertSecureExternalOutputPublicationSupported({ platform = process.platform } = {}) {
  if (platform !== 'linux'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure external --output publication is unavailable on this platform');
  }
}

function openBoundOutputDirectory(outputDirectory) {
  const root = path.parse(outputDirectory).root;
  let directoryFd = openBoundDirectoryAtPath(root);
  try {
    for (const segment of path.relative(root, outputDirectory).split(path.sep).filter(Boolean)) {
      const parentDescriptorPath = descriptorDirectoryPathFor(directoryFd);
      const childPath = path.join(parentDescriptorPath, segment);
      let childFd;
      try {
        childFd = openBoundDirectoryAtPath(childPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw outputDirectoryError(error);
        try {
          fs.mkdirSync(childPath, { mode: 0o700 });
        } catch (mkdirError) {
          if (mkdirError?.code !== 'EEXIST') throw outputDirectoryError(mkdirError);
        }
        try {
          childFd = openBoundDirectoryAtPath(childPath);
        } catch (openError) {
          throw outputDirectoryError(openError);
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

function bindProtectedBaseAutomaticArtifactDirectory({ repoRoot, artifactRoot } = {}) {
  const trustedRoot = path.resolve(requireText(repoRoot, 'repository root'));
  const root = path.resolve(requireText(artifactRoot, 'base automatic artifact root'));
  const directoryFd = openBoundProtectedBaseAutomaticArtifactDirectory({
    repoRoot: trustedRoot,
    artifactRoot: root,
  });
  try {
    const identity = fs.fstatSync(directoryFd);
    return Object.freeze({
      repoRoot: trustedRoot,
      root,
      directoryFd,
      dev: identity.dev,
      ino: identity.ino,
    });
  } catch (error) {
    fs.closeSync(directoryFd);
    throw error;
  }
}

function openBoundProtectedBaseAutomaticArtifactDirectory({ repoRoot, artifactRoot } = {}) {
  const trustedRoot = path.resolve(requireText(repoRoot, 'repository root'));
  const target = path.resolve(requireText(artifactRoot, 'base automatic artifact root'));
  const relative = path.relative(trustedRoot, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('protected base automatic artifact directory must remain inside the repository');
  }
  let directoryFd;
  try {
    assertCanonicalBaseAutomaticDirectoryPath(trustedRoot, 'repository root');
    directoryFd = openBoundDirectoryAtPath(trustedRoot);
    assertPrivateBaseAutomaticDirectory(fs.fstatSync(directoryFd), `protected base automatic artifact ancestor: ${trustedRoot}`);
    let currentPath = trustedRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      const childFd = openBoundDirectoryAtPath(path.join(descriptorDirectoryPathFor(directoryFd), segment));
      fs.closeSync(directoryFd);
      directoryFd = childFd;
      currentPath = path.join(currentPath, segment);
      assertPrivateBaseAutomaticDirectory(fs.fstatSync(directoryFd), `protected base automatic artifact ancestor: ${currentPath}`);
    }
    return directoryFd;
  } catch (error) {
    if (directoryFd != null) fs.closeSync(directoryFd);
    throw protectedBaseAutomaticArtifactDirectoryError(error);
  }
}

function assertProtectedBaseAutomaticArtifactIdentity(protectedArtifact) {
  const currentFd = openBoundProtectedBaseAutomaticArtifactDirectory({
    repoRoot: protectedArtifact.repoRoot,
    artifactRoot: protectedArtifact.root,
  });
  try {
    const current = fs.fstatSync(currentFd);
    if (current.dev !== protectedArtifact.dev || current.ino !== protectedArtifact.ino) {
      throw new Error('protected base automatic artifact directory identity changed or is unavailable');
    }
  } finally {
    fs.closeSync(currentFd);
  }
}

function protectedBaseAutomaticArtifactDirectoryError(error) {
  if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
    return new Error('protected base automatic artifact directory identity changed or is unavailable');
  }
  return error;
}

function openBoundDirectoryAtPath(directoryPath) {
  return fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

function descriptorDirectoryPathFor(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function outputDirectoryError(error) {
  if (error?.code === 'ELOOP') {
    return new Error('--output must not have a symbolic-link ancestor');
  }
  if (error?.code === 'ENOTDIR') {
    return new Error('--output must have only directory ancestors');
  }
  return error;
}

function assertBoundOutputDirectoryDoesNotOverlapArtifact({ directoryFd, protectedArtifact }) {
  const outputDirectory = fs.fstatSync(directoryFd);
  if (outputDirectory.dev === protectedArtifact.dev && outputDirectory.ino === protectedArtifact.ino) {
    throw new Error('--output must not overlap the protected base automatic artifact directory');
  }
}

function createBoundOutputTemporaryFile({ descriptorDirectoryPath, outputName }) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | fs.constants.O_NOFOLLOW;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporaryPath = path.join(
      descriptorDirectoryPath,
      `.${outputName}.${randomBytes(16).toString('hex')}.tmp`,
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
  throw new Error('unable to reserve a secure external --output temporary file');
}

function requireBaseAutomaticArtifactDomain(value) {
  const domain = requireText(value, 'base automatic artifact domain');
  if (!BASE_DOMAINS.has(domain)) throw new Error(`unsupported base automatic artifact domain: ${domain}`);
  return domain;
}

function requireBaseAutomaticArtifactRunId(value, domain) {
  const runId = requireText(value, 'base automatic artifact runId');
  const prefix = `${domain}_l1_auto_`;
  const digest = runId.slice(prefix.length);
  if (!runId.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(digest)) {
    throw new Error('base automatic artifact runId must be the content-derived automatic run identity');
  }
  return runId;
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

function maxBaseAutomaticExecutionTime(now, sourceCheckedAt, currentTime = now) {
  const requestedTime = requireTimestamp(now, 'execution time');
  const checkedTime = requireTimestamp(sourceCheckedAt, 'sourceCheckedAt');
  const freshTime = requireTimestamp(currentTime, 'current execution time');
  const latest = Math.max(Date.parse(requestedTime), Date.parse(checkedTime), Date.parse(freshTime));
  return [requestedTime, checkedTime, freshTime].find((value) => Date.parse(value) === latest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBaseDomainAutomaticOperation().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => { process.stderr.write(`base automatic operation failed: ${error.message}\n`); process.exitCode = 1; },
  );
}
