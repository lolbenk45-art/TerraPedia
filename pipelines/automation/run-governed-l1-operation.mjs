#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot, resolveSharedDataRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import {
  loadMysqlModule,
} from '../lib/mysql-module.mjs';
import {
  createMysqlSupplementaryL1Adapter,
  executeSupplementaryL1Operation,
  readCurrentSupplementaryContext,
} from './run-supplementary-domain-l1-operation.mjs';
import {
  buildSupplementaryL1Bundle,
  assertSupplementaryOwnedTables,
} from './supplementary-domain-l1-contract.mjs';
import {
  buildShimmerImportPreview,
  loadCurrentShimmerScope,
  loadTargetFingerprint,
  loadVerifiedShimmerImportBundle,
} from '../import/import-wiki-shimmer-to-db.mjs';

export const GOVERNED_L1_DOMAIN_ORDER = Object.freeze([
  'items',
  'npcs',
  'projectiles',
  'armor_sets',
  'buffs',
  'audio',
  'bosses',
  'shimmer',
]);

const DOMAIN_CONFIG = Object.freeze({
  items: Object.freeze({
    operationId: 'automation-items-l1',
    ownedTables: Object.freeze([{ databaseRole: 'local', table: 'items' }]),
    sourceKind: 'module',
    sourceFile: 'module__iteminfo__data.latest.json',
    standardizedEntities: Object.freeze(['items']),
    fetchScript: 'pipelines/fetch/fetch-wiki-iteminfo.mjs',
  }),
  npcs: Object.freeze({
    operationId: 'automation-npcs-l1',
    ownedTables: Object.freeze([{ databaseRole: 'local', table: 'npcs' }]),
    sourceKind: 'module',
    sourceFile: 'module__npcinfo__data.latest.json',
    standardizedEntities: Object.freeze(['npcs', 'items']),
    fetchScript: 'pipelines/fetch/fetch-wiki-npcinfo.mjs',
  }),
  projectiles: Object.freeze({
    operationId: 'automation-projectiles-l1',
    ownedTables: Object.freeze([{ databaseRole: 'local', table: 'projectiles' }]),
    sourceKind: 'module',
    sourceFile: 'module__projectileinfo__data.latest.json',
    standardizedEntities: Object.freeze(['projectiles', 'items']),
    fetchScript: 'pipelines/fetch/fetch-wiki-projectileinfo.mjs',
  }),
  armor_sets: Object.freeze({
    operationId: 'automation-armor-sets-l1',
    ownedTables: Object.freeze([
      { databaseRole: 'local', table: 'armor_sets' },
      { databaseRole: 'local', table: 'armor_set_items' },
    ]),
    sourceKind: 'module',
    sourceFile: 'module__armorsetbonuses.latest.json',
    standardizedEntities: Object.freeze(['armor_sets', 'items']),
    fetchScript: 'pipelines/fetch/fetch-wiki-armorsetbonuses.mjs',
  }),
  buffs: Object.freeze({
    operationId: 'automation-buffs-l1',
    ownedTables: Object.freeze([
      { databaseRole: 'local', table: 'buffs' },
      { databaseRole: 'local', table: 'buff_source_items' },
    ]),
    sourceKind: 'template',
    sourceFile: 'template__getbuffinfo.latest.json',
    standardizedEntities: Object.freeze(['buffs', 'items', 'npcs']),
    fetchScript: 'pipelines/fetch/fetch-wiki-buffs.mjs',
  }),
  audio: Object.freeze({
    operationId: 'automation-audio-first-l1',
    ownedTables: Object.freeze([
      { databaseRole: 'local', table: 'audio_assets' },
      { databaseRole: 'local', table: 'audio_asset_links' },
    ]),
    sourceKind: 'media_catalog',
    sourceFile: null,
    fetchScript: 'pipelines/fetch/fetch-wiki-audio-assets.mjs',
  }),
  bosses: Object.freeze({
    operationId: 'automation-bosses-first-l1',
    ownedTables: Object.freeze([
      { databaseRole: 'local', table: 'boss_groups' },
      { databaseRole: 'local', table: 'npcs' },
    ]),
    sourceKind: 'page_catalog',
    sourceFile: null,
    fetchScript: 'pipelines/fetch/fetch-wiki-bosses.mjs',
  }),
  shimmer: Object.freeze({
    operationId: 'automation-shimmer-first-l1',
    ownedTables: Object.freeze([
      { databaseRole: 'local', table: 'shimmer_item_transforms' },
      { databaseRole: 'local', table: 'shimmer_decraft_rules' },
      { databaseRole: 'local', table: 'shimmer_entity_transforms' },
      { databaseRole: 'local', table: 'shimmer_npc_transforms' },
    ]),
    sourceKind: 'page_and_langlinks',
    sourceFile: null,
    fetchScript: 'pipelines/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
  }),
});

const SOURCE_ACTION_IDS = Object.freeze({
  items: 'wiki-items-source-refresh',
  npcs: 'wiki-npcs-source-refresh',
  projectiles: 'wiki-projectiles-source-refresh',
  armor_sets: 'domain-source-armor-sets',
  buffs: 'buff-page-immunity-refresh',
  audio: 'wiki-audio-assets-refresh',
  bosses: 'domain-source-bosses',
  shimmer: 'domain-source-shimmer',
});

export function getGovernedL1DomainConfig(domainId) {
  const normalized = String(domainId ?? '').trim();
  const config = DOMAIN_CONFIG[normalized];
  if (!config) throw new Error(`unsupported governed L1 domain: ${normalized || '<empty>'}`);
  return {
    domainId: normalized,
    operationId: config.operationId,
    ownedTables: config.ownedTables.map((entry) => ({ ...entry })),
    sourceKind: config.sourceKind,
    sourceFile: config.sourceFile,
    standardizedEntities: config.standardizedEntities ? [...config.standardizedEntities] : [],
    fetchScript: config.fetchScript,
  };
}

export function buildL1RunArtifactPaths({ repoRoot = process.cwd(), domainId, runId } = {}) {
  const config = getGovernedL1DomainConfig(domainId);
  const normalizedRunId = requireRunId(runId, config.domainId);
  const root = path.resolve(repoRoot);
  const relativeRoot = `reports/authorization/canonical/l1-runs/${config.domainId}/${normalizedRunId}`;
  const absoluteRoot = path.resolve(root, relativeRoot);
  const reconciliationRoot = `reports/runtime/l1-reconciliation/${config.domainId}/${normalizedRunId}`;
  return Object.freeze({
    domainId: config.domainId,
    runId: normalizedRunId,
    relativeRoot,
    root: absoluteRoot,
    sourcePath: path.join(absoluteRoot, 'source.json'),
    bundlePath: path.join(absoluteRoot, 'bundle.json'),
    authorizationPath: path.join(absoluteRoot, 'authorization-context.json'),
    resultPath: path.join(absoluteRoot, 'result.json'),
    progressPath: path.join(absoluteRoot, 'progress.json'),
    reconciliationRoot,
    sourceCoveragePath: `${reconciliationRoot}/source-coverage.json`,
    ownedTableReadbackPath: `${reconciliationRoot}/owned-table-readback.json`,
    attemptStatePath: `${reconciliationRoot}/attempt-state.json`,
    reconciliationOutputPath: `${reconciliationRoot}/reconciliation-evidence.json`,
  });
}

export function buildManualL1AuthorizationContext({
  operationId,
  domainId,
  runId,
  actor = 'admin',
  reason = 'Approved serial eight-domain L1 evidence repair',
  authorizationReference = null,
  decisionIdentity = null,
  generatedAt = new Date().toISOString(),
  expiresAt = null,
  policySetHash = null,
  serverFingerprint = null,
} = {}) {
  const config = getGovernedL1DomainConfig(domainId);
  if (operationId !== config.operationId) {
    throw new Error(`operationId must match the ${config.domainId} governed L1 operation`);
  }
  const normalizedRunId = requireRunId(runId, config.domainId);
  const authorizedAt = requireTimestamp(generatedAt, 'authorizedAt');
  const expiry = expiresAt == null
    ? new Date(Date.parse(authorizedAt) + 2 * 60 * 60 * 1000).toISOString()
    : requireTimestamp(expiresAt, 'expiresAt');
  if (Date.parse(expiry) <= Date.parse(authorizedAt)) throw new Error('expiresAt must be after authorizedAt');
  const dateTag = authorizedAt.slice(0, 10);
  const reference = String(authorizationReference ?? `user://conversation/${dateTag}/eight-domain-l1-${normalizedRunId}`).trim();
  const identity = String(decisionIdentity ?? `eight-domain-l1-${normalizedRunId}-${randomBytes(8).toString('hex')}`).trim();
  const payload = {
    schemaVersion: 1,
    requestKind: 'governed_l1_run_authorization',
    authorizationStatus: 'AUTHORIZED',
    operationId: config.operationId,
    domainId: config.domainId,
    runId: normalizedRunId,
    executionMode: 'MANUAL_OWNER_L1',
    actor: requireText(actor, 'actor'),
    reason: requireText(reason, 'reason'),
    authorizationReference: requireText(reference, 'authorizationReference'),
    decisionIdentity: requireText(identity, 'decisionIdentity'),
    authorizedAt,
    expiresAt: expiry,
    policySetHash: policySetHash == null ? null : requireHash(policySetHash, 'policySetHash'),
    serverFingerprint: serverFingerprint == null ? null : requireHash(serverFingerprint, 'serverFingerprint'),
  };
  return Object.freeze({ ...payload, packetHash: hashCanonicalJson(payload) });
}

export async function runGovernedL1Operation({
  domainId,
  runId,
  repoRoot = getProjectRoot(),
  env = process.env,
  sourceMode = 'local',
  generatedAt = new Date().toISOString(),
  actor = env.TERRAPEDIA_ADMIN_USERNAME ?? 'admin',
  reason,
  authorizationReference,
  decisionIdentity,
  fullReconciliation = false,
  mysqlModule = null,
  runSourceImpl = runSource,
} = {}) {
  const config = getGovernedL1DomainConfig(domainId);
  const root = path.resolve(repoRoot);
  const paths = buildL1RunArtifactPaths({ repoRoot: root, domainId: config.domainId, runId });
  assertNoExistingRun(paths);
  if (!['local', 'live'].includes(sourceMode)) throw new Error('sourceMode must be local or live');
  assertSupplementaryOwnedTables(config.domainId, config.ownedTables);
  const db = mysqlModule ?? loadMysqlModule();
  const connection = await db.createConnection(connectionOptions(env));
  let bundle;
  let context;
  try {
    const current = await readCurrentSupplementaryContext(connection, {
      bundle: { domainId: config.domainId, ownedTables: config.ownedTables },
      environmentId: env.TERRAPEDIA_AUTOMATION_ENVIRONMENT_ID ?? 'local',
    });
    context = buildManualL1AuthorizationContext({
      operationId: config.operationId,
      domainId: config.domainId,
      runId: paths.runId,
      actor,
      reason,
      authorizationReference,
      decisionIdentity,
      generatedAt,
      policySetHash: current.policySetHash,
    });
    writeJsonExclusive(paths.authorizationPath, context);
    const source = await runSourceImpl({
      domainId: config.domainId,
      runId: paths.runId,
      repoRoot: root,
      sourceMode,
      progressPath: paths.progressPath,
      env,
    });
    writeJsonExclusive(paths.sourcePath, source.sourcePayload);
    writeProgressSnapshot(paths.progressPath, {
      actionId: SOURCE_ACTION_IDS[config.domainId],
      status: 'completed',
      phase: 'source-frozen',
      message: `frozen ${config.domainId} source for governed L1 run`,
      current: 1,
      total: 1,
      runId: paths.runId,
      sourceMode,
    });
    const importPlan = await buildImportPlan({
      domainId: config.domainId,
      sourcePayload: source.sourcePayload,
      sourceResult: source,
      connection,
      repoRoot: root,
      bundle: { domainId: config.domainId, ownedTables: config.ownedTables },
    });
    const reconciliationInput = fullReconciliation
      ? {
        sourceCoveragePath: paths.sourceCoveragePath,
        ownedTableReadbackPath: paths.ownedTableReadbackPath,
        attemptStatePath: paths.attemptStatePath,
        outputPath: paths.reconciliationOutputPath,
      }
      : undefined;
    bundle = buildSupplementaryL1Bundle({
      operationId: config.operationId,
      runId: paths.runId,
      domainId: config.domainId,
      generatedAt,
      policy: {
        domainId: config.domainId,
        level: current.currentLevel,
        operationalState: current.operationalState,
        policyVersion: current.policyVersion,
        policyHash: current.policyHash,
        policySetHash: current.policySetHash,
      },
      baseline: current.baseline,
      source: {
        path: path.relative(root, paths.sourcePath).replaceAll('\\', '/'),
        sha256: hashFileBytes(paths.sourcePath),
      },
      ownedTables: config.ownedTables,
      importPlan,
      executionMode: 'MANUAL_OWNER_L1',
      reconciliationInput,
    });
    writeJsonExclusive(paths.bundlePath, bundle);
    const result = await executeSupplementaryL1Operation({
      adapter: createMysqlSupplementaryL1Adapter(connection, {
        bundlePath: paths.bundlePath,
        repoRoot: root,
        environmentId: env.TERRAPEDIA_AUTOMATION_ENVIRONMENT_ID ?? 'local',
      }),
      bundle,
      authorizationContext: context,
      now: generatedAt,
    });
    writeJsonExclusive(paths.resultPath, result);
    return Object.freeze({
      ...result,
      artifactPaths: paths,
      authorizationContext: context,
      sourceMode,
      fullReconciliation,
    });
  } finally {
    await connection.end();
  }
}

export async function runSource({
  domainId,
  runId,
  repoRoot,
  sourceMode = 'local',
  progressPath,
  env = process.env,
} = {}) {
  const config = getGovernedL1DomainConfig(domainId);
  if (sourceMode === 'live') {
    await runNode([config.fetchScript, ...sourceCommandArgs(domainId, progressPath, runId)], {
      cwd: repoRoot,
      env: { ...env, TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath },
    });
  }
  const sourcePayload = loadSourcePayload({ domainId, repoRoot });
  return Object.freeze({ sourcePayload, sourceMode, runId });
}

export async function buildImportPlan({
  domainId,
  sourcePayload,
  sourceResult = {},
  connection = null,
  repoRoot = null,
  bundle = null,
  loadShimmerBundleImpl = loadVerifiedShimmerImportBundle,
  loadCurrentScopeImpl = loadCurrentShimmerScope,
  loadTargetFingerprintImpl = loadTargetFingerprint,
  buildShimmerPreviewImpl = buildShimmerImportPreview,
} = {}) {
  if (domainId === 'audio') return { summary: { assets: sourcePayload.assets?.length ?? 0 } };
  if (domainId === 'bosses') return { summary: { records: sourcePayload.records?.length ?? 0 } };
  if (domainId === 'shimmer') {
    if (!connection) throw new Error('Shimmer import plan requires the current database connection');
    const pointer = {
      ...sourcePayload,
      manifestPath: normalizeShimmerManifestPath(
        sourcePayload?.manifestPath,
        sourcePayload?.generationId,
      ),
    };
    const shimmerBundle = loadShimmerBundleImpl({
      bundleManifestPath: pointer.manifestPath,
      repoRoot: repoRoot ?? bundle?.repoRoot ?? getProjectRoot(),
    });
    const existing = await loadCurrentScopeImpl(connection, shimmerBundle);
    const target = await loadTargetFingerprintImpl(connection, {
      host: connection.config?.host ?? '127.0.0.1',
      port: Number(connection.config?.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
      database: connection.config?.database ?? 'terria_v1_local',
    });
    const preview = buildShimmerPreviewImpl({ bundle: shimmerBundle, existing, target });
    return {
      previewSha256: preview.previewSha256,
      targetFingerprintSha256: preview.targetFingerprintSha256,
      summary: preview.tables,
      manifestPath: pointer.manifestPath,
      generationId: pointer.generationId,
    };
  }
  const records = sourcePayload?.datasets?.[domainId]?.records;
  return {
    entity: domainId,
    recordCount: Array.isArray(records) ? records.length : 0,
    itemDependencyCount: Array.isArray(sourcePayload?.datasets?.items?.records)
      ? sourcePayload.datasets.items.records.length
      : 0,
    sourceKind: getGovernedL1DomainConfig(domainId).sourceKind,
    sourceResult: sourceResult.sourceMode ?? 'local',
  };
}

function loadSourcePayload({ domainId, repoRoot }) {
  const config = getGovernedL1DomainConfig(domainId);
  if (domainId === 'audio') {
    return readJson(resolveSharedDataRoot('generated', 'wiki-audio-assets.latest.json'));
  }
  if (domainId === 'bosses') {
    return readJson(path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json'));
  }
  if (domainId === 'shimmer') {
    const pointer = readJson(path.join(repoRoot, 'data', 'generated', 'shimmer', 'wiki-shimmer-current-generation.json'));
    return {
      ...pointer,
      manifestPath: normalizeShimmerManifestPath(pointer.manifestPath, pointer.generationId),
    };
  }
  const datasets = {};
  for (const entity of config.standardizedEntities) {
    const filePath = path.join(repoRoot, 'data', 'standardized', `${entity}.standardized.json`);
    const payload = readJson(filePath);
    if (payload.entity !== entity || !Array.isArray(payload.records)) {
      throw new Error(`standardized ${entity} dataset is invalid`);
    }
    datasets[entity] = payload;
  }
  const rawPath = resolveSharedDataRoot('raw', 'wiki', config.sourceFile);
  const raw = readJson(rawPath);
  return {
    schemaVersion: 1,
    domainId,
    source: {
      path: rawPath,
      sourceKind: config.sourceKind,
      fetchedAt: raw.fetchedAt ?? null,
      revisionTimestamp: raw.revisionTimestamp ?? raw.sourceRevisionTimestamp ?? null,
      contentHash: hashJson(raw),
    },
    raw,
    datasets,
  };
}

function sourceCommandArgs(domainId, progressPath, runId) {
  if (domainId === 'audio') {
    return [
      '--mode=all',
      '--allow-full-audio-corpus=true',
      '--max-total-files=600',
      '--max-api-pages-per-prefix=100',
      `--progress-path=${progressPath}`,
    ];
  }
  if (domainId === 'bosses') return [`--resume-mode=fresh`, `--progress-path=${progressPath}`];
  if (domainId === 'armor_sets') return [`--progress-path=${progressPath}`];
  if (domainId === 'buffs') return [`--progress-path=${progressPath}`, '--skip-buff-page-immunities=true'];
  if (domainId === 'shimmer') return [`--run-id=${runId}`, `--progress-path=${progressPath}`];
  return [];
}

function connectionOptions(env) {
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TERRAPEDIA_DB_PORT must be a valid port');
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') throw new Error('TERRAPEDIA_DB_NAME must be exactly terria_v1_local');
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

function assertNoExistingRun(paths) {
  for (const filePath of [paths.root, paths.sourcePath, paths.bundlePath, paths.authorizationPath, paths.resultPath]) {
    try {
      fs.lstatSync(filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`L1 run artifact already exists; overwrite is forbidden: ${filePath}`);
  }
}

function writeJsonExclusive(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    fs.linkSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  fs.chmodSync(filePath, 0o600);
}

function writeProgressSnapshot(filePath, payload) {
  const timestamp = new Date().toISOString();
  writeJsonFile(filePath, buildActionProgressPayload({
    generatedAt: timestamp,
    lastHeartbeatAt: timestamp,
    childStatusPath: filePath,
    startedAt: timestamp,
    ...payload,
  }));
}

function runNode([script, ...args], { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`governed L1 source command failed: ${script} code=${code} signal=${signal ?? '-'}`));
    });
  });
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function normalizeShimmerManifestPath(value, generationId) {
  const supplied = requireText(value, 'Shimmer manifest path');
  const expectedGenerationId = requireText(generationId, 'Shimmer generation id');
  if (!/^[a-f0-9]{64}$/.test(expectedGenerationId)) {
    throw new Error('Shimmer generation id must be a content hash');
  }
  if (supplied.includes('\\')
      || path.posix.isAbsolute(supplied)
      || path.posix.normalize(supplied) !== supplied) {
    throw new Error('Shimmer manifest path must be a normalized relative path');
  }
  const manifestPath = supplied.startsWith('data/generated/shimmer/')
    ? supplied
    : path.posix.join('data/generated/shimmer', supplied);
  const expectedPath = `data/generated/shimmer/generations/${expectedGenerationId}/wiki-shimmer-manifest.json`;
  if (manifestPath !== expectedPath) {
    throw new Error('Shimmer manifest path must name the exact generation');
  }
  return expectedPath;
}

export function hashFileBytes(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashCanonicalJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireRunId(value, domainId) {
  const runId = requireText(value, 'runId');
  if (!new RegExp(`^${domainId}_l1_[a-z0-9_]{8,72}$`).test(runId)) {
    throw new Error(`runId must use the bounded ${domainId}_l1 identity`);
  }
  return runId;
}

function requireHash(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value ?? ''))) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  runGovernedL1Operation({
    domainId: args.domain,
    runId: args['run-id'],
    repoRoot: args['repo-root'] ?? getProjectRoot(),
    env: process.env,
    sourceMode: args['source-mode'] ?? 'local',
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
    actor: args.actor,
    reason: args.reason,
    authorizationReference: args['authorization-reference'],
    decisionIdentity: args['decision-identity'],
    fullReconciliation: args['full-reconciliation'] === 'true',
  }).then((result) => {
    process.stdout.write(`${JSON.stringify({
      runId: result.runId,
      domainId: result.domainId,
      status: result.status,
      bundleHash: result.bundleHash,
      resultPath: result.artifactPaths.resultPath,
      reconciliation: result.fullReconciliation,
    })}\n`);
  }).catch((error) => {
    process.stderr.write(`governed L1 operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
