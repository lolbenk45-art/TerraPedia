#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runIndependentEntityImport } from '../import/import-independent-entities-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
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
} from './run-supplementary-domain-l1-operation.mjs';
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';
import { buildAutomaticRunId, runImportThenAcknowledge } from './run-automatic-domain-operation.mjs';
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
  now = new Date().toISOString(),
  mysqlModule = null,
  runSourceImpl = runSource,
  heartbeatIntervalMs = undefined,
} = {}) {
  const args = parseArgs(argv);
  const domain = requireText(args.domain, '--domain');
  if (args['run-id']) throw new Error('--run-id is not allowed for automatic operations');
  if (!BASE_DOMAINS.has(domain)) throw new Error(`unsupported base automatic domain: ${domain}`);
  const config = requireAutoDomainOperation(domain);
  const repoRoot = env.WORKTREE_ROOT ?? process.cwd();
  const manifestPath = resolveBaseDomainManifestPath({
    manifestPath: args['manifest-path'],
    repoRoot,
  });
  const db = mysqlModule ?? loadMysqlModule();
  const connection = await db.createConnection(connectionOptions(env));
  let activationVerified = false;
  let runnerProgress = null;
  try {
    const activation = await loadFreshActivation(connection);
    if (!activation) throw new Error(`no fresh scheduler activation for automatic domain: ${domain}`);
    activationVerified = true;

    const crawlRunId = `${domain}_source_${now.replace(/\D/g, '').slice(0, 14)}`;
    const progressPath = path.resolve(
      args['progress-path'] ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? defaultProgressPath(domain),
    );
    runnerProgress = createBaseRunnerProgress({ progressPath, domain, env, heartbeatIntervalMs });
    const sourceMode = args['source-mode'] ?? 'live';
    if (!['live', 'local'].includes(sourceMode)) throw new Error('--source-mode must be live or local');
    if (sourceMode === 'live') {
      runSourceImpl({ domain, progressPath, runId: crawlRunId, env });
    } else {
      runnerProgress.publish({ status: 'running', phase: 'local-frozen-source', runId: crawlRunId });
    }
    const sourceFingerprint = readBaseDomainSourceFingerprint(domain);
    const { runId, frozen } = freezeBaseAutomaticInput({ domain, sourceFingerprint, repoRoot });

    if (config.databaseMode === 'DRY_RUN') {
      runnerProgress.publish({ status: 'running', phase: 'database-dry-run', runId });
      const importSummary = domain === 'items'
        ? validateItemDryRunDataset(frozen.datasets.items)
        : await runIndependentEntityImport({
            apply: 'false',
            entity: domain,
          }, { mysqlModule: db, datasets: frozen.datasets });
      assertImportSummaryHealthy(importSummary);
      const result = { schemaVersion: 1, domainId: domain, runId, status: 'completed', databaseMode: 'DRY_RUN', importSummary };
      acknowledgeBaseDomainSourceIfLive({ sourceMode, domain, repoRoot, manifestPath });
      const completedResult = withBaseSourceAcknowledgement(result, sourceMode);
      if (args.output) writeJsonAtomic(path.resolve(args.output), completedResult);
      runnerProgress.publish({ status: 'completed', phase: 'dry-run-completed', runId });
      return completedResult;
    }

    const alreadyCommitted = await isCommittedBaseAutomaticRun(connection, {
      runId,
      domainId: domain,
      sourceFingerprint,
      source: frozen.source,
    });
    if (alreadyCommitted) {
      const result = await runImportThenAcknowledge({
        alreadyCommitted: true,
        executeImport: async () => { throw new Error('committed automatic run must not execute import'); },
        acknowledgeSource: async () => acknowledgeBaseDomainSourceIfLive({
          sourceMode, domain, repoRoot, manifestPath,
        }),
      });
      runnerProgress.publish({ status: 'completed', phase: 'acknowledgement-reconciled', runId });
      const completedResult = withBaseSourceAcknowledgement({ ...result, domainId: domain, runId }, sourceMode);
      if (args.output) writeJsonAtomic(path.resolve(args.output), completedResult);
      return completedResult;
    }

    const current = await readCurrentSupplementaryContext(connection, {
      bundle: { domainId: domain, ownedTables: config.ownedTables },
    });
    if (activation.policySetHash !== current.policySetHash) {
      throw new Error('scheduler activation policy set does not match current policy set');
    }
    const bundle = buildSupplementaryL1Bundle({
      operationId: config.operationId,
      runId,
      domainId: domain,
      generatedAt: now,
      executionMode: 'ACTIVATION_GATED_AUTO',
      policy: {
        domainId: domain,
        level: current.currentLevel,
        operationalState: current.operationalState,
        policyVersion: current.policyVersion,
        policyHash: current.policyHash,
        policySetHash: current.policySetHash,
      },
      baseline: current.baseline,
      source: frozen.source,
      ownedTables: config.ownedTables,
      importPlan: {
        ...frozen.importPlan,
        automaticSourceFingerprint: sourceFingerprint,
      },
    });
    writeJsonAtomic(frozen.bundlePath, bundle);
    runnerProgress.publish({ status: 'running', phase: 'database-apply', runId });
    const result = await executeSupplementaryL1Operation({
      adapter: createMysqlSupplementaryL1Adapter(connection, {
        bundlePath: frozen.bundlePath,
        repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
      }),
      bundle,
      authorizationContext: activationContext(activation, bundle.operationId),
      now,
    });
    acknowledgeBaseDomainSourceIfLive({ sourceMode, domain, repoRoot, manifestPath });
    const completedResult = withBaseSourceAcknowledgement(result, sourceMode);
    if (args.output) writeJsonAtomic(path.resolve(args.output), completedResult);
    runnerProgress.publish({ status: 'completed', phase: 'completed', runId });
    return completedResult;
  } catch (error) {
    if (activationVerified && runnerProgress) {
      runnerProgress.publish({ status: 'failed', phase: 'failed', message: error.message });
    }
    throw error;
  } finally {
    runnerProgress?.stop();
    await connection.end();
  }
}

export function resolveBaseDomainManifestPath({ manifestPath, repoRoot }) {
  return path.resolve(repoRoot, manifestPath ?? 'data/generated/wiki-source-manifest.latest.json');
}

export function freezeBaseAutomaticInput({
  domain,
  sourceFingerprint,
  repoRoot,
  freezeInputImpl = freezeStandardizedInput,
}) {
  const runId = buildAutomaticRunId(domain, sourceFingerprint);
  return {
    runId,
    frozen: freezeInputImpl({ domain, runId, repoRoot }),
  };
}

export async function isCommittedBaseAutomaticRun(connection, {
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

function runSource({ domain, progressPath, env }) {
  const command = buildBaseDomainSourceCommand(domain, progressPath);
  const result = spawnSync(process.execPath, command, {
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
      'scripts/data/workflow/run-wiki-sync.mjs',
      '--mode=apply',
      '--force=true',
      `--entity=${domain}`,
      `--manifest-path=${path.join(stagingRoot, `${domain}-source-manifest.staging.json`)}`,
      `--plan-path=${path.join(stagingRoot, `${domain}-wiki-sync-plan.staging.json`)}`,
    ];
  }
  if (domain === 'buffs') {
    return ['scripts/data/fetch/fetch-wiki-buffs.mjs', `--progress-path=${progressPath}`];
  }
  if (domain === 'armor_sets') {
    return ['scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs', `--progress-path=${progressPath}`];
  }
  throw new Error(`unsupported base automatic source domain: ${domain}`);
}

export function acknowledgeBaseDomainSource({
  domain,
  repoRoot,
  manifestPath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
}) {
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

function acknowledgeBaseDomainSourceIfLive({ sourceMode, domain, repoRoot, manifestPath }) {
  if (sourceMode !== 'live') return;
  acknowledgeBaseDomainSource({ domain, repoRoot, manifestPath });
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

function freezeStandardizedInput({ domain, runId, repoRoot }) {
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
  const base = `automation-${domain.replaceAll('_', '-')}-${runId}`;
  const relativeSourcePath = `reports/authorization/canonical/${base}.source.json`;
  const sourcePath = path.join(repoRoot, relativeSourcePath);
  const bundlePath = path.join(repoRoot, `reports/authorization/canonical/${base}.bundle.json`);
  writeJsonAtomic(sourcePath, payload);
  return {
    source: { path: relativeSourcePath, sha256: hashFrozenSourcePayload(payload) },
    bundlePath,
    datasets,
    importPlan: {
      entity: domain,
      recordCount: datasets[domain].records.length,
      itemDependencyCount: datasets.items.records.length,
    },
  };
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

export function hashFrozenSourcePayload(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBaseDomainAutomaticOperation().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => { process.stderr.write(`base automatic operation failed: ${error.message}\n`); process.exitCode = 1; },
  );
}
