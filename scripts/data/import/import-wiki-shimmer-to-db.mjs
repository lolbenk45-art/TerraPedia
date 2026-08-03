#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext
} from '../automation/authorized-operation-context.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { verifyShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';

const repoRoot = getProjectRoot();
const OPERATION_ID = 'canonical-shimmer-import';
const DECISION_LEDGER_PATH = 'reports/authorization/canonical/used-decisions.json';
const GENERATION_MANIFEST_FILE = 'wiki-shimmer-manifest.json';
const SHIMMER_PROVIDER = 'wiki_zh';
const SHIMMER_SOURCE_PAGE = '微光';
const SHIMMER_TABLE_NAMES = Object.freeze([
  'shimmer_item_transforms',
  'shimmer_decraft_rules',
  'shimmer_entity_transforms',
  'shimmer_npc_transforms'
]);
const AUTHORIZED_SHIMMER_IMPORT_BINDING_FIELDS = Object.freeze([
  'operationId',
  'generationId',
  'manifestSha256',
  'dataBundleSha256',
  'previewSha256',
  'targetFingerprintSha256',
  'providerScope'
]);
const SHIMMER_SCOPE_KEY_FIELDS = Object.freeze({
  world_contexts: ['code'],
  entity_source_snapshots: ['entityType', 'provider', 'sourceKind', 'sourceLocator'],
  shimmer_item_transforms: [
    'contextCode',
    'inputKind',
    'inputNameEn',
    'inputNameZh',
    'inputInternalName',
    'outputKind',
    'outputNameEn',
    'outputNameZh',
    'outputInternalName',
    'sortOrder'
  ],
  shimmer_decraft_rules: [
    'contextCode',
    'ruleType',
    'groupLabel',
    'inputKind',
    'inputNameEn',
    'inputNameZh',
    'inputInternalName',
    'sortOrder'
  ],
  shimmer_entity_transforms: [
    'contextCode',
    'transformGroup',
    'inputEntityType',
    'inputNameEn',
    'inputNameZh',
    'inputInternalName',
    'outputEntityType',
    'outputNameEn',
    'outputNameZh',
    'outputInternalName',
    'sortOrder'
  ],
  shimmer_npc_transforms: [
    'contextCode',
    'npcNameEn',
    'npcNameZh',
    'npcInternalName',
    'appearanceVariant',
    'effectType',
    'sortOrder'
  ]
});
const IMPORTABLE_PAYLOAD_FILES = Object.freeze({
  rawPayload: 'wiki-shimmer.raw.json',
  contextPayload: 'wiki-shimmer-context.importable.json',
  itemTransformsPayload: 'wiki-shimmer-item-transforms.importable.json',
  decraftRulesPayload: 'wiki-shimmer-decraft-rules.importable.json',
  entityTransformsPayload: 'wiki-shimmer-entity-transforms.importable.json',
  npcTransformsPayload: 'wiki-shimmer-npc-transforms.importable.json',
  titleResolutionPayload: 'wiki-shimmer-title-resolution.evidence.json'
});

if (isDirectExecution()) {
  main().catch((error) => {
    console.error('[import-wiki-shimmer-to-db] failed');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const result = await runShimmerImport({
    apply,
    bundleManifestPath: args['bundle-manifest'] ?? args.bundleManifest,
    database: args.database,
    dbOverrides: {
      host: args.host,
      password: args.password,
      port: args.port,
      user: args.user
    },
    env: process.env,
    outputPath: args.output,
    repoRoot
  });
  console.log(JSON.stringify(result, null, 2));
}

function buildDatabaseConfig({ config, env, overrides = {}, database } = {}) {
  const db = {
    host: overrides.host ?? env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(overrides.port ?? env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: overrides.user ?? env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: overrides.password ?? env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: database ?? env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };
  return db;
}

export function loadVerifiedShimmerImportBundle({ bundleManifestPath, repoRoot: suppliedRepoRoot = repoRoot } = {}) {
  const root = path.resolve(suppliedRepoRoot);
  const manifestPath = requireContentAddressedManifestPath({ bundleManifestPath, repoRoot: root });
  const verified = verifyShimmerGeneration({ manifestPath });
  const generationDirectoryName = path.basename(verified.generationPath);
  if (generationDirectoryName !== verified.manifest.generationId) {
    throw new Error('bundle manifest generation ID does not match its content-addressed directory');
  }
  const descriptorsByName = new Map(verified.manifest.files.map((descriptor) => [descriptor.name, descriptor]));
  const payloads = Object.fromEntries(Object.entries(IMPORTABLE_PAYLOAD_FILES).map(([key, fileName]) => [
    key,
    readVerifiedShimmerGenerationPayload({
      generationPath: verified.generationPath,
      fileName,
      expectedDescriptor: descriptorsByName.get(fileName)
    })
  ]));
  requireVerifiedShimmerWorldContext(payloads.contextPayload);
  return Object.freeze({
    ...payloads,
    dataBundleSha256: verified.manifest.dataBundleSha256,
    generationId: verified.manifest.generationId,
    generationPath: verified.generationPath,
    manifest: verified.manifest,
    manifestPath: verified.manifestPath,
    manifestSha256: verified.manifest.manifestSha256,
    repoRoot: root
  });
}

export function buildShimmerImportPreview({ bundle, target, existing = {} } = {}) {
  const projection = buildShimmerImportProjection({ bundle });
  const normalizedBundle = requireVerifiedBundle(bundle);
  const targetFingerprint = normalizeTargetFingerprint(target);
  const existingSnapshots = normalizeSnapshotRows(existing?.snapshots);
  const tables = Object.fromEntries(SHIMMER_TABLE_NAMES.map((tableName) => {
    const existingRows = Array.isArray(existing?.shimmerTables?.[tableName])
      ? existing.shimmerTables[tableName]
      : [];
    const nextRows = projection.shimmerTables[tableName];
    return [tableName, {
      before: describeRows(tableName, existingRows),
      after: describeRows(tableName, nextRows)
    }];
  }));
  const preview = {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    providerScope: {
      provider: SHIMMER_PROVIDER,
      sourcePage: SHIMMER_SOURCE_PAGE,
      tables: [...SHIMMER_TABLE_NAMES]
    },
    generationId: normalizedBundle.generationId,
    dataBundleSha256: normalizedBundle.dataBundleSha256,
    manifestSha256: normalizedBundle.manifestSha256,
    target: targetFingerprint,
    targetFingerprintSha256: hashCanonical(targetFingerprint),
    tables,
    worldContext: {
      before: describeRows(
        'world_contexts',
        existing?.worldContext == null ? [] : [normalizeWorldContext(existing.worldContext)]
      ),
      after: describeRows('world_contexts', [projection.worldContext])
    },
    snapshots: {
      before: describeRows('entity_source_snapshots', existingSnapshots),
      after: describeRows(
        'entity_source_snapshots',
        mergeSnapshotProjectionRows(existingSnapshots, projection.snapshots)
      )
    }
  };
  return freezeDeep({
    ...preview,
    previewSha256: hashCanonical(preview)
  });
}

function normalizeSnapshotRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeSnapshotProjectionRow) : [];
}

function mergeSnapshotProjectionRows(existingRows, nextRows) {
  const rowsByKey = new Map();
  for (const row of [...existingRows, ...nextRows]) {
    const normalized = normalizeShimmerDbRow(row);
    rowsByKey.set(JSON.stringify(scopeKeyForRow('entity_source_snapshots', normalized)), normalized);
  }
  return [...rowsByKey.values()];
}

export function buildShimmerImportProjection({ bundle } = {}) {
  const normalizedBundle = requireVerifiedBundle(bundle);
  assertBundleProviderScope(normalizedBundle);
  const worldContext = requireVerifiedShimmerWorldContext(normalizedBundle.contextPayload);
  const shimmerTables = buildShimmerTableProjectionRows(normalizedBundle, worldContext.code);
  const snapshots = buildShimmerSnapshotDefinitions(normalizedBundle)
    .map(snapshotDefinitionToProjection);
  return Object.freeze({
    worldContext,
    shimmerTables: Object.freeze(shimmerTables),
    snapshots: Object.freeze(snapshots)
  });
}

function assertBundleProviderScope(bundle) {
  for (const tableName of SHIMMER_TABLE_NAMES) {
    for (const record of importRecordsForTable(bundle, tableName)) {
      if (toText(record?.sourceProvider) != null && toText(record.sourceProvider) !== SHIMMER_PROVIDER) {
        throw new Error(`verified shimmer import record provider is outside ${SHIMMER_PROVIDER}: ${tableName}`);
      }
      if (toText(record?.sourcePage) !== SHIMMER_SOURCE_PAGE) {
        throw new Error(`verified shimmer import record source page is outside ${SHIMMER_SOURCE_PAGE}: ${tableName}`);
      }
    }
  }
}

export async function runShimmerImport(options = {}, dependencies = {}) {
  const root = path.resolve(options.repoRoot ?? repoRoot);
  const apply = booleanOption(options.apply, false);
  const outputPath = resolveShimmerImportOutputPath({
    apply,
    outputPath: options.outputPath,
    repoRoot: root
  });

  const loadAuthorizationContext = dependencies.loadAuthorizationContext ?? loadAuthorizedOperationContext;
  const consumeDispatchPermit = dependencies.consumeDispatchPermit ?? consumeAuthorizedOperationDispatchPermit;
  const loadCurrentScope = dependencies.loadCurrentScope ?? loadCurrentShimmerScope;
  const loadTarget = dependencies.loadTarget ?? loadTargetFingerprint;
  const buildPreview = dependencies.buildPreview ?? buildShimmerImportPreview;
  const applyVerified = dependencies.applyVerified ?? applyVerifiedShimmerImport;
  const writeCanonicalResult = dependencies.writeCanonicalResult ?? writeCanonicalShimmerImportResult;
  let bundle = null;
  let preview = null;
  let connection = null;
  let committed = null;
  let phase = 'preflight';
  let primaryError = null;
  try {
    bundle = loadVerifiedShimmerImportBundle({
      bundleManifestPath: options.bundleManifestPath,
      repoRoot: root
    });
    const config = dependencies.loadLocalStackConfig?.(root) ?? loadLocalStackConfig(root);
    const db = buildDatabaseConfig({
      config,
      env: options.env ?? process.env,
      overrides: options.dbOverrides,
      database: options.database
    });
    assertPrimaryDb(db.database, apply, false);
    const authorizedContext = apply
      ? loadAuthorizationContext({ env: options.env ?? process.env, operationId: OPERATION_ID })
      : null;
    const authorizedBinding = apply
      ? assertAuthorizedBundle({ authorizedContext, bundle })
      : null;
    const mysql = loadMysqlModule();
    const mysqlClient = dependencies.mysql ?? mysql;
    phase = 'connect';
    connection = await mysqlClient.createConnection({ ...db, dateStrings: true });
    phase = 'load_current_scope';
    await connection.query('SET NAMES utf8mb4');
    const existing = await loadCurrentScope(connection, bundle);
    preview = buildPreview({
      bundle,
      existing,
      target: await loadTarget(connection, db)
    });
    if (apply) {
      assertAuthorizedShimmerImportBindingMatchesPreview({
        binding: authorizedBinding,
        bundle,
        preview
      });
    }
    if (!apply) {
      phase = 'write_preview';
      const result = buildShimmerImportResult({ bundle, preview, apply: false, status: 'preview' });
      await writeImportReport(outputPath, root, result);
      return result;
    }
    phase = 'verify_target';
    const currentTarget = await loadTarget(connection, db);
    phase = 'apply';
    const result = await applyVerified({
      authorizedContext,
      bundle,
      connection,
      consumeDispatchPermit: () => consumeDispatchPermit({
        env: options.env ?? process.env,
        authorizedContext,
        decisionLedgerPath: path.join(root, DECISION_LEDGER_PATH)
      }),
      preview,
      readLockedBefore: () => loadCurrentShimmerScope(connection, bundle, { forUpdate: true }),
      currentTargetFingerprintSha256: hashCanonical(normalizeTargetFingerprint(currentTarget)),
      applyChanges: () => applyBundleChanges({ bundle, connection }),
      verifyAfter: async () => {
        const after = await loadCurrentShimmerScope(connection, bundle);
        assertShimmerImportScopeMatchesPreview({ after, preview });
      }
    });
    if (result?.status !== 'completed') {
      throw new Error(`verified shimmer import apply did not complete: ${result?.status ?? 'unknown'}`);
    }
    committed = true;
    phase = 'write_completed_result';
    const completed = buildShimmerImportResult({ bundle, preview, apply: true, status: 'completed', result });
    await writeCanonicalResult(outputPath, root, completed);
    return completed;
  } catch (error) {
    primaryError = error;
    if (apply && committed !== true) {
      const failed = buildShimmerImportResult({
        bundle,
        preview,
        apply: true,
        status: 'failed',
        result: { phase, reason: error?.message ?? String(error) }
      });
      try {
        await writeCanonicalResult(outputPath, root, failed);
      } catch {
        // Preserve the operation failure when its private failure report cannot be written.
      }
    }
    throw error;
  } finally {
    if (connection != null && typeof connection.end === 'function') {
      try {
        await connection.end();
      } catch (closeError) {
        if (primaryError == null) throw closeError;
      }
    }
  }
}

export function resolveShimmerImportOutputPath({ apply = false, outputPath, repoRoot: suppliedRepoRoot = repoRoot } = {}) {
  const root = path.resolve(suppliedRepoRoot);
  if (apply) {
    const fallbackPath = path.join(
      root,
      'reports',
      'authorization',
      'canonical',
      'canonical-shimmer-import.result.json'
    );
    return requireCanonicalReportPath(outputPath ?? fallbackPath, root);
  }
  const fallbackPath = path.join(root, 'reports', 'wiki-shimmer-db-import-preview.json');
  return requirePreviewReportPath(outputPath ?? fallbackPath, root);
}

export async function applyVerifiedShimmerImport({
  authorizedContext,
  bundle,
  connection,
  consumeDispatchPermit,
  currentTargetFingerprintSha256,
  preview,
  readLockedBefore,
  applyChanges,
  verifyAfter
} = {}) {
  const normalizedBundle = requireVerifiedBundle(bundle);
  const authorizedBinding = assertAuthorizedBundle({ authorizedContext, bundle: normalizedBundle });
  requireMatchingPreview({ bundle: normalizedBundle, preview });
  if (currentTargetFingerprintSha256 !== undefined
      && currentTargetFingerprintSha256 !== preview.targetFingerprintSha256) {
    throw new Error('verified shimmer import target fingerprint drifted after preview');
  }
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new TypeError('transactional shimmer import connection is required');
  }
  if (typeof consumeDispatchPermit !== 'function') {
    throw new TypeError('shimmer import dispatch permit consumer is required');
  }
  if (typeof applyChanges !== 'function' || typeof verifyAfter !== 'function') {
    throw new TypeError('shimmer import apply and verification functions are required');
  }

  assertAuthorizedShimmerImportBindingMatchesPreview({
    binding: authorizedBinding,
    bundle: normalizedBundle,
    preview
  });
  if (typeof readLockedBefore !== 'function') {
    throw new TypeError('shimmer import locked scope reader is required');
  }
  let begun = false;
  try {
    await connection.beginTransaction();
    begun = true;
    const lockedBefore = await readLockedBefore();
    assertLockedShimmerImportScopeMatchesPreview({ before: lockedBefore, preview });
    consumeDispatchPermit();
    await applyChanges();
    await verifyAfter();
    await connection.commit();
    return Object.freeze({ status: 'completed' });
  } catch (error) {
    if (begun) await connection.rollback();
    throw error;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireContentAddressedManifestPath({ bundleManifestPath, repoRoot: root }) {
  const supplied = String(bundleManifestPath ?? '').trim();
  if (!supplied) throw new Error('bundle manifest is required');
  const manifestPath = path.resolve(root, supplied);
  const relativePath = path.relative(root, manifestPath).replaceAll('\\', '/');
  const segments = relativePath.split('/');
  if (path.basename(manifestPath) !== GENERATION_MANIFEST_FILE
      || segments.length !== 6
      || segments[0] !== 'data'
      || segments[1] !== 'generated'
      || segments[2] !== 'shimmer'
      || segments[3] !== 'generations'
      || !/^[a-f0-9]{64}$/.test(segments[4] ?? '')
      || segments[5] !== GENERATION_MANIFEST_FILE) {
    throw new Error('bundle manifest must be a content-addressed generation manifest');
  }
  if (relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
    throw new Error('bundle manifest must be inside the repository root');
  }
  const stat = fs.lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('bundle manifest must be an ordinary file');
  }
  const canonicalGenerationRoot = path.join(root, 'data', 'generated', 'shimmer', 'generations');
  const realGenerationRoot = fs.realpathSync(canonicalGenerationRoot);
  const realManifestPath = fs.realpathSync(manifestPath);
  const realRelativePath = path.relative(realGenerationRoot, realManifestPath);
  if (realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
    throw new Error('bundle manifest must resolve inside the canonical generation root');
  }
  return manifestPath;
}

export function readVerifiedShimmerGenerationPayload({ generationPath, fileName, expectedDescriptor } = {}) {
  const normalizedFileName = String(fileName ?? '').trim();
  if (!normalizedFileName || expectedDescriptor?.name !== normalizedFileName
      || expectedDescriptor?.path !== normalizedFileName
      || !isSha256(expectedDescriptor?.sha256)
      || !Number.isSafeInteger(expectedDescriptor?.byteLength)
      || expectedDescriptor.byteLength < 0) {
    throw new Error('verified generation payload descriptor is invalid');
  }
  const payloadPath = path.resolve(generationPath, fileName);
  if (!payloadPath.startsWith(`${path.resolve(generationPath)}${path.sep}`)) {
    throw new Error(`generation payload escapes its directory: ${fileName}`);
  }
  const stat = fs.lstatSync(payloadPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`generation payload must be an ordinary file: ${fileName}`);
  }
  const bytes = fs.readFileSync(payloadPath);
  const actualSha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (actualSha256 !== expectedDescriptor.sha256) {
    throw new Error(`generation payload hash mismatch: ${fileName}`);
  }
  if (bytes.length !== expectedDescriptor.byteLength) {
    throw new Error(`generation payload byte length mismatch: ${fileName}`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

function requireVerifiedBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('verified shimmer import bundle is required');
  if (!/^[a-f0-9]{64}$/.test(String(bundle.generationId ?? ''))
      || !isSha256(bundle.dataBundleSha256)
      || !isSha256(bundle.manifestSha256)) {
    throw new Error('verified shimmer import bundle identity is invalid');
  }
  return bundle;
}

function normalizeTargetFingerprint(target) {
  const host = String(target?.host ?? '').trim();
  const database = String(target?.database ?? '').trim();
  const serverUuid = String(target?.serverUuid ?? '').trim();
  const port = Number(target?.port);
  if (!host || !database || !serverUuid || !Number.isInteger(port) || port <= 0) {
    throw new Error('target fingerprint requires host, port, database, and server UUID');
  }
  return { host, port, database, serverUuid };
}

function importRecordsForTable(bundle, tableName) {
  const payloadByTable = {
    shimmer_item_transforms: bundle.itemTransformsPayload,
    shimmer_decraft_rules: bundle.decraftRulesPayload,
    shimmer_entity_transforms: bundle.entityTransformsPayload,
    shimmer_npc_transforms: bundle.npcTransformsPayload
  };
  const records = payloadByTable[tableName]?.records;
  if (!Array.isArray(records)) throw new Error(`verified bundle is missing records for ${tableName}`);
  return records;
}

function describeRows(tableName, rows) {
  const normalized = Array.isArray(rows)
    ? rows.map(stableValue).sort(compareCanonicalRows)
    : [];
  const logicalKeys = normalized.map((row) => scopeKeyForRow(tableName, row));
  const descriptor = {
    count: normalized.length,
    keySha256: hashCanonical({
      tableName,
      rows: logicalKeys
    }),
    logicalKeys,
    sha256: hashCanonical({ tableName, rows: normalized })
  };
  if (tableName === 'entity_source_snapshots') {
    descriptor.descriptors = normalized.map((row) => ({
      logicalKey: scopeKeyForRow(tableName, row),
      payloadSha256: row.payloadSha256 ?? null,
      sourcePage: row.sourcePage ?? null,
      sourceRevisionTimestamp: row.sourceRevisionTimestamp ?? null,
      fetchedAt: row.fetchedAt ?? null,
      isCurrent: row.isCurrent ?? null,
      parseStatus: row.parseStatus ?? null
    }));
  }
  return descriptor;
}

function compareCanonicalRows(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function scopeKeyForRow(tableName, row) {
  const fields = SHIMMER_SCOPE_KEY_FIELDS[tableName] ?? Object.keys(row ?? {}).sort();
  return Object.fromEntries(fields.map((field) => [field, row?.[field] ?? null]));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function freezeDeep(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) freezeDeep(nested);
  return value;
}

function hashCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

function assertAuthorizedBundle({ authorizedContext, bundle }) {
  if (authorizedContext?.operationId !== OPERATION_ID) {
    throw new Error(`authorized shimmer import operation must be ${OPERATION_ID}`);
  }
  if (authorizedContext?.dataBundleSha256 !== bundle.dataBundleSha256) {
    throw new Error('authorized shimmer import data bundle does not match the verified manifest');
  }
  const binding = requireAuthorizedShimmerImportBinding(authorizedContext);
  if (binding.operationId !== OPERATION_ID
      || binding.generationId !== bundle.generationId
      || binding.manifestSha256 !== bundle.manifestSha256
      || binding.dataBundleSha256 !== bundle.dataBundleSha256) {
    throw new Error('authorized shimmer import binding does not match the verified bundle');
  }
  return binding;
}

function requireAuthorizedShimmerImportBinding(authorizedContext) {
  const binding = authorizedContext?.executionManifest?.shimmerImport;
  if (!hasExactFields(binding, AUTHORIZED_SHIMMER_IMPORT_BINDING_FIELDS)) {
    throw new Error('authorized shimmer import binding must contain exactly the required fields');
  }
  if (binding.operationId !== OPERATION_ID
      || !/^[a-f0-9]{64}$/.test(String(binding.generationId ?? ''))
      || !isSha256(binding.manifestSha256)
      || !isSha256(binding.dataBundleSha256)
      || !isSha256(binding.previewSha256)
      || !isSha256(binding.targetFingerprintSha256)
      || !hasExpectedProviderScope(binding.providerScope)) {
    throw new Error('authorized shimmer import binding has an invalid shape');
  }
  return binding;
}

function assertAuthorizedShimmerImportBindingMatchesPreview({ binding, bundle, preview }) {
  if (binding.operationId !== preview?.operationId
      || binding.generationId !== bundle.generationId
      || binding.generationId !== preview?.generationId
      || binding.manifestSha256 !== bundle.manifestSha256
      || binding.manifestSha256 !== preview?.manifestSha256
      || binding.dataBundleSha256 !== bundle.dataBundleSha256
      || binding.dataBundleSha256 !== preview?.dataBundleSha256
      || binding.previewSha256 !== preview?.previewSha256
      || binding.targetFingerprintSha256 !== preview?.targetFingerprintSha256
      || hashCanonical(binding.providerScope) !== hashCanonical(preview?.providerScope)) {
    throw new Error('authorized shimmer import binding does not match the verified preview');
  }
}

function hasExactFields(value, fields) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function requireMatchingPreview({ bundle, preview }) {
  const { previewSha256, ...previewPayload } = preview ?? {};
  if (!preview || preview.operationId !== OPERATION_ID
      || preview.generationId !== bundle.generationId
      || preview.dataBundleSha256 !== bundle.dataBundleSha256
      || preview.manifestSha256 !== bundle.manifestSha256
      || !isSha256(previewSha256)
      || previewSha256 !== hashCanonical(previewPayload)
      || !isSha256(preview.targetFingerprintSha256)
      || !hasExpectedProviderScope(preview.providerScope)) {
    throw new Error('verified shimmer import preview does not match the authorized bundle');
  }
}

function hasExpectedProviderScope(scope) {
  return hasExactFields(scope, ['provider', 'sourcePage', 'tables'])
    && scope.provider === SHIMMER_PROVIDER
    && scope?.sourcePage === SHIMMER_SOURCE_PAGE
    && JSON.stringify(scope?.tables) === JSON.stringify(SHIMMER_TABLE_NAMES);
}

function buildShimmerSnapshotDefinitions(bundle) {
  const generationDirectory = path.dirname(bundle.manifestPath);
  const fetchedAt = toDateTime(bundle.manifest?.generatedAt);
  if (!fetchedAt) throw new Error('verified shimmer generation manifest must include generatedAt');
  return [
    buildSnapshotDefinition('wiki_shimmer_page', bundle.rawPayload, path.join(generationDirectory, IMPORTABLE_PAYLOAD_FILES.rawPayload), bundle.rawPayload, 'wiki_page', bundle.repoRoot, fetchedAt),
    buildSnapshotDefinition('wiki_shimmer_context', bundle.contextPayload, path.join(generationDirectory, IMPORTABLE_PAYLOAD_FILES.contextPayload), bundle.contextPayload, 'generated_json', bundle.repoRoot, fetchedAt),
    buildSnapshotDefinition('wiki_shimmer_item_transforms', bundle.itemTransformsPayload, path.join(generationDirectory, IMPORTABLE_PAYLOAD_FILES.itemTransformsPayload), bundle.itemTransformsPayload, 'generated_json', bundle.repoRoot, fetchedAt),
    buildSnapshotDefinition('wiki_shimmer_decraft_rules', bundle.decraftRulesPayload, path.join(generationDirectory, IMPORTABLE_PAYLOAD_FILES.decraftRulesPayload), bundle.decraftRulesPayload, 'generated_json', bundle.repoRoot, fetchedAt),
    buildSnapshotDefinition('wiki_shimmer_entity_transforms', bundle.entityTransformsPayload, path.join(generationDirectory, IMPORTABLE_PAYLOAD_FILES.entityTransformsPayload), bundle.entityTransformsPayload, 'generated_json', bundle.repoRoot, fetchedAt),
    buildSnapshotDefinition('wiki_shimmer_npc_transforms', bundle.npcTransformsPayload, path.join(generationDirectory, IMPORTABLE_PAYLOAD_FILES.npcTransformsPayload), bundle.npcTransformsPayload, 'generated_json', bundle.repoRoot, fetchedAt),
    buildSnapshotDefinition('wiki_shimmer_manifest', bundle.manifest, bundle.manifestPath, bundle.contextPayload, 'generated_json', bundle.repoRoot, fetchedAt)
  ];
}

function buildSnapshotDefinition(entityType, payload, absolutePath, sourceMetaPayload, sourceKind, sourceRoot = repoRoot, fetchedAt) {
  const unresolvedCount = Number(payload?.resolution?.unresolvedCount ?? 0);
  const page = sourceMetaPayload?.page ?? sourceMetaPayload?.records?.[0] ?? {};
  return {
    entityType,
    provider: SHIMMER_PROVIDER,
    sourceKind,
    sourceLocator: path.relative(sourceRoot, absolutePath).replaceAll('\\', '/'),
    sourcePage: SHIMMER_SOURCE_PAGE,
    sourceRevisionTimestamp: toDateTime(
      page?.sourceRevisionTimestamp
      ?? page?.revisionTimestamp
      ?? sourceMetaPayload?.revisionTimestamp
    ),
    payloadJson: JSON.stringify(payload),
    fetchedAt,
    parseStatus: unresolvedCount > 0 ? 'partial' : 'parsed'
  };
}

function snapshotDefinitionToProjection(definition) {
  return normalizeSnapshotProjectionRow({
    entityType: definition.entityType,
    provider: definition.provider,
    sourceKind: definition.sourceKind,
    sourceLocator: definition.sourceLocator,
    sourcePage: definition.sourcePage,
    sourceRevisionTimestamp: definition.sourceRevisionTimestamp,
    isCurrent: 1,
    parseStatus: definition.parseStatus,
    payloadSha256: hashSnapshotPayloadJson(definition.payloadJson),
    fetchedAt: definition.fetchedAt
  });
}

function normalizeSnapshotProjectionRow(row) {
  const normalized = normalizeShimmerDbRow(row);
  const payloadJson = row?.payloadJson ?? row?.payload_json;
  const payloadSha256 = isSha256(normalized.payloadSha256)
    ? normalized.payloadSha256
    : payloadJson == null ? null : hashSnapshotPayloadJson(payloadJson);
  return normalizeShimmerDbRow({
    entityType: normalized.entityType,
    provider: normalized.provider,
    sourceKind: normalized.sourceKind,
    sourceLocator: normalized.sourceLocator,
    sourcePage: normalized.sourcePage,
    sourceRevisionTimestamp: normalized.sourceRevisionTimestamp,
    isCurrent: normalized.isCurrent,
    parseStatus: normalized.parseStatus,
    payloadSha256,
    fetchedAt: normalized.fetchedAt
  });
}

function hashSnapshotPayloadJson(payloadJson) {
  const bytes = Buffer.isBuffer(payloadJson)
    ? payloadJson
    : Buffer.from(String(payloadJson), 'utf8');
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

async function upsertWorldContext(connection, worldContext, stats, shouldApply) {
  const payload = normalizeWorldContext(worldContext);
  const existing = await loadWorldContextByCode(connection, payload.code);
  const nextId = existing?.id ?? null;

  if (!shouldApply) {
    if (existing) stats.updated += 1;
    else stats.created += 1;
    return nextId;
  }

  if (existing) {
    await connection.execute(
      `UPDATE world_contexts
          SET name_en = ?,
              name_zh = ?,
              context_type = ?,
              description = ?,
              icon_url = ?,
              sort_order = ?,
              status = 1,
              deleted = 0,
              updated_at = NOW()
        WHERE id = ?`,
      [
        payload.nameEn,
        payload.nameZh,
        payload.contextType,
        payload.description,
        payload.iconUrl,
        payload.sortOrder,
        existing.id
      ]
    );
    stats.updated += 1;
    return existing.id;
  }

  const [result] = await connection.execute(
    `INSERT INTO world_contexts
      (code, name_en, name_zh, context_type, description, icon_url, sort_order, status, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [
      payload.code,
      payload.nameEn,
      payload.nameZh,
      payload.contextType,
      payload.description,
      payload.iconUrl,
      payload.sortOrder
    ]
  );
  stats.created += 1;
  return Number(result.insertId);
}

function normalizeWorldContext(worldContext) {
  return {
    code: toText(worldContext?.code) ?? 'SHIMMER',
    nameEn: toText(worldContext?.nameEn) ?? 'Shimmer',
    nameZh: toText(worldContext?.nameZh) ?? '\u5fae\u5149',
    contextType: toText(worldContext?.contextType) ?? 'ENVIRONMENT',
    description: toText(worldContext?.description),
    iconUrl: toText(worldContext?.iconUrl),
    sortOrder: Number.isFinite(Number(worldContext?.sortOrder)) ? Number(worldContext.sortOrder) : 30
  };
}

function requireVerifiedShimmerWorldContext(contextPayload) {
  const records = contextPayload?.records;
  if (!Array.isArray(records) || records.length !== 1
      || records[0] == null || typeof records[0] !== 'object' || Array.isArray(records[0])
      || records[0].code !== 'SHIMMER') {
    throw new Error('verified shimmer import context must contain exactly one SHIMMER record');
  }
  return normalizeWorldContext(records[0]);
}

export async function upsertSnapshot(connection, definition, shouldApply) {
  const [existingRows] = await connection.execute(
    `SELECT id
       FROM entity_source_snapshots
      WHERE entity_type = ?
        AND provider = ?
        AND source_kind = ?
        AND COALESCE(source_locator, '') = ?
        AND source_page = ?
      LIMIT 1`,
    [definition.entityType, definition.provider, definition.sourceKind, definition.sourceLocator, definition.sourcePage]
  );

  const action = existingRows.length > 0 ? 'updated' : 'created';
  if (!shouldApply) {
    return { action };
  }

  const payload = [
    definition.entityType,
    null,
    definition.provider,
    definition.sourceKind,
    definition.sourceLocator,
    definition.sourcePage,
    definition.sourceRevisionTimestamp,
    definition.payloadJson,
    definition.fetchedAt,
    1,
    definition.parseStatus
  ];

  if (existingRows.length > 0) {
    await connection.execute(
      `UPDATE entity_source_snapshots
          SET entity_type = ?,
              entity_id = ?,
              provider = ?,
              source_kind = ?,
              source_locator = ?,
              source_page = ?,
              source_revision_timestamp = ?,
              payload_json = ?,
              fetched_at = ?,
              is_current = ?,
              parse_status = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [...payload, Number(existingRows[0].id)]
    );
  } else {
    await connection.execute(
      `INSERT INTO entity_source_snapshots
        (entity_type, entity_id, provider, source_kind, source_locator, source_page, source_revision_timestamp, payload_json, fetched_at, is_current, parse_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload
    );
  }

  return { action };
}

async function loadWorldContextByCode(connection, code) {
  const [[row]] = await connection.execute(
    `SELECT id, code, name_en AS nameEn, name_zh AS nameZh, context_type AS contextType, sort_order AS sortOrder
       FROM world_contexts
      WHERE code = ?
      LIMIT 1`,
    [code]
  );
  return row
    ? {
        id: Number(row.id),
        code: row.code,
        nameEn: row.nameEn,
        nameZh: row.nameZh,
        contextType: row.contextType,
        sortOrder: Number(row.sortOrder ?? 0)
      }
    : null;
}

async function loadSnapshotStats(connection, sourcePage) {
  const [rows] = await connection.execute(
    `SELECT entity_type AS entityType,
            parse_status AS parseStatus,
            COUNT(*) AS count
       FROM entity_source_snapshots
      WHERE provider = 'wiki_zh'
        AND source_page = ?
      GROUP BY entity_type, parse_status
      ORDER BY entity_type ASC, parse_status ASC`,
    [sourcePage]
  );
  return rows.map((row) => ({
    entityType: row.entityType,
    parseStatus: row.parseStatus,
    count: Number(row.count ?? 0)
  }));
}

async function loadShimmerTableStats(connection) {
  const stats = {};
  for (const table of SHIMMER_TABLE_NAMES) {
    try {
      const [[row]] = await connection.query(
        `SELECT COUNT(*) AS c
           FROM ${table}
          WHERE deleted = 0
            AND COALESCE(source_provider, '') = 'wiki_zh'
            AND source_page = ?`,
        ['\u5fae\u5149']
      );
      stats[table] = Number(row.c ?? 0);
    } catch {
      stats[table] = null;
    }
  }
  return stats;
}

async function loadCurrentShimmerScope(connection, bundle, { forUpdate = false } = {}) {
  const projection = buildShimmerImportProjection({ bundle });
  const lockClause = forUpdate ? ' FOR UPDATE' : '';
  const [[worldContextRow]] = await connection.execute(
    `SELECT code,
            name_en AS nameEn,
            name_zh AS nameZh,
            context_type AS contextType,
            description,
            icon_url AS iconUrl,
            sort_order AS sortOrder
      FROM world_contexts
      WHERE code = ?
      LIMIT 1${lockClause}`,
    [projection.worldContext.code]
  );
  const shimmerTables = {};
  for (const tableName of SHIMMER_TABLE_NAMES) {
    const columns = SHIMMER_TABLE_COLUMNS[tableName]
      .map((column) => `${toSnakeCase(column)} AS ${column}`)
      .join(', ');
    const [rows] = await connection.execute(
      `SELECT ${columns}
         FROM ${tableName}
        WHERE deleted = 0
          AND COALESCE(source_provider, '') = ?
          AND source_page = ?
        ORDER BY sort_order ASC, id ASC${lockClause}`,
      [SHIMMER_PROVIDER, SHIMMER_SOURCE_PAGE]
    );
    shimmerTables[tableName] = rows.map((row) => normalizeShimmerDbRow(row));
  }
  const [snapshots] = await connection.execute(
    `SELECT entity_type AS entityType,
            provider,
            source_kind AS sourceKind,
            source_locator AS sourceLocator,
            source_page AS sourcePage,
            source_revision_timestamp AS sourceRevisionTimestamp,
            payload_json AS payloadJson,
            fetched_at AS fetchedAt,
            is_current AS isCurrent,
            parse_status AS parseStatus
       FROM entity_source_snapshots
      WHERE provider = ?
        AND source_page = ?
      ORDER BY entity_type ASC, id ASC${lockClause}`,
    [SHIMMER_PROVIDER, SHIMMER_SOURCE_PAGE]
  );
  return {
    worldContext: worldContextRow == null ? null : normalizeWorldContext(worldContextRow),
    shimmerTables,
    snapshots: snapshots.map(normalizeSnapshotProjectionRow)
  };
}

async function loadTargetFingerprint(connection, db) {
  const [[row]] = await connection.query('SELECT @@server_uuid AS serverUuid');
  return {
    host: db.host,
    port: db.port,
    database: db.database,
    serverUuid: String(row?.serverUuid ?? '').trim()
  };
}

async function applyBundleChanges({ bundle, connection }) {
  const summary = createLegacySummary({ bundle, database: null, reportPath: null, apply: true });
  const projection = buildShimmerImportProjection({ bundle });
  const context = projection.worldContext;
  const contextId = await upsertWorldContext(connection, context, summary.worldContext, true);
  summary.worldContext.id = contextId;
  for (const definition of buildShimmerSnapshotDefinitions(bundle)) {
    const result = await upsertSnapshot(connection, definition, true);
    summary.snapshots[result.action] += 1;
  }
  await importShimmerItemTransforms(connection, context.code, bundle.itemTransformsPayload.records, summary.shimmerTables.itemTransforms, true);
  await importShimmerDecraftRules(connection, context.code, bundle.decraftRulesPayload.records, summary.shimmerTables.decraftRules, true);
  await importShimmerEntityTransforms(connection, context.code, bundle.entityTransformsPayload.records, summary.shimmerTables.entityTransforms, true);
  await importShimmerNpcTransforms(connection, context.code, bundle.npcTransformsPayload.records, summary.shimmerTables.npcTransforms, true);
  return summary;
}

function createLegacySummary({ bundle, database, reportPath, apply }) {
  return {
    generatedAt: new Date().toISOString(),
    apply,
    database,
    reportPath,
    input: { manifest: bundle.manifestPath },
    counts: {
      itemTransforms: bundle.itemTransformsPayload.records.length,
      decraftRules: bundle.decraftRulesPayload.records.length,
      entityTransforms: bundle.entityTransformsPayload.records.length,
      npcTransforms: bundle.npcTransformsPayload.records.length,
      unresolvedTitles: 0
    },
    worldContext: { created: 0, updated: 0, id: null },
    snapshots: { created: 0, updated: 0, entries: [] },
    shimmerTables: {
      itemTransforms: { created: 0, replaced: 0 },
      decraftRules: { created: 0, replaced: 0 },
      entityTransforms: { created: 0, replaced: 0 },
      npcTransforms: { created: 0, replaced: 0 }
    }
  };
}

export function assertShimmerImportScopeMatchesPreview({ after, preview }) {
  assertScopeDescriptorMatches(
    'world_contexts',
    after?.worldContext == null ? [] : [after.worldContext],
    preview?.worldContext?.after
  );
  for (const tableName of SHIMMER_TABLE_NAMES) {
    assertScopeDescriptorMatches(
      tableName,
      after?.shimmerTables?.[tableName] ?? [],
      preview?.tables?.[tableName]?.after
    );
  }
  assertScopeDescriptorMatches(
    'entity_source_snapshots',
    normalizeSnapshotRows(after?.snapshots),
    preview?.snapshots?.after
  );
}

function assertLockedShimmerImportScopeMatchesPreview({ before, preview }) {
  assertScopeDescriptorMatches(
    'world_contexts',
    before?.worldContext == null ? [] : [before.worldContext],
    preview?.worldContext?.before,
    'locked pre-apply scope does not match preview'
  );
  for (const tableName of SHIMMER_TABLE_NAMES) {
    assertScopeDescriptorMatches(
      tableName,
      before?.shimmerTables?.[tableName] ?? [],
      preview?.tables?.[tableName]?.before,
      'locked pre-apply scope does not match preview'
    );
  }
  assertScopeDescriptorMatches(
    'entity_source_snapshots',
    normalizeSnapshotRows(before?.snapshots),
    preview?.snapshots?.before,
    'locked pre-apply scope does not match preview'
  );
}

function assertScopeDescriptorMatches(tableName, rows, expected, mismatchMessage = 'post-write count/hash mismatch') {
  const actual = describeRows(tableName, rows);
  if (actual.count !== expected?.count
      || actual.sha256 !== expected?.sha256
      || (expected?.keySha256 != null && actual.keySha256 !== expected.keySha256)) {
    throw new Error(`${mismatchMessage} for ${tableName}`);
  }
}

function buildShimmerImportResult({ bundle = null, preview = null, apply, status, result = null }) {
  const output = {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    status,
    apply
  };
  if (bundle?.generationId != null) output.generationId = bundle.generationId;
  if (bundle?.dataBundleSha256 != null) output.dataBundleSha256 = bundle.dataBundleSha256;
  if (bundle?.manifestSha256 != null) output.manifestSha256 = bundle.manifestSha256;
  if (preview?.previewSha256 != null) output.previewSha256 = preview.previewSha256;
  if (preview?.targetFingerprintSha256 != null) output.targetFingerprintSha256 = preview.targetFingerprintSha256;
  if (preview?.providerScope != null) output.providerScope = preview.providerScope;
  if (preview?.target != null) output.target = preview.target;
  if (preview?.worldContext != null) output.worldContext = preview.worldContext;
  if (preview?.tables != null) output.tables = preview.tables;
  if (preview?.snapshots != null) output.snapshots = preview.snapshots;
  if (result != null) output.transaction = result;
  if (status === 'failed') {
    output.phase = result?.phase ?? 'unknown';
    output.reason = result?.reason ?? 'unknown error';
  }
  return output;
}

async function writeCanonicalShimmerImportResult(outputPath, root, result) {
  const fallbackPath = path.join(
    root,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-import.result.json'
  );
  const reportPath = requireCanonicalReportPath(outputPath ?? fallbackPath, root);
  await writePrivateJson(reportPath, result);
}

async function writeImportReport(outputPath, root, result) {
  const fallbackPath = path.join(root, 'reports', 'wiki-shimmer-db-import-preview.json');
  const reportPath = requirePreviewReportPath(outputPath ?? fallbackPath, root);
  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function requirePreviewReportPath(outputPath, root) {
  const reportPath = path.resolve(outputPath);
  const relativePath = path.relative(root, reportPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('shimmer import report path must be inside the repository root');
  }
  return reportPath;
}

function requireCanonicalReportPath(outputPath, root) {
  const reportPath = path.resolve(outputPath);
  const canonicalPath = path.join(
    root,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-import.result.json'
  );
  if (reportPath !== canonicalPath) {
    throw new Error('applied shimmer import result must use the canonical private result path');
  }
  return reportPath;
}

async function writePrivateJson(outputPath, value) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = `${outputPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx'
    });
    await fs.promises.rename(temporary, outputPath);
    await fs.promises.chmod(outputPath, 0o600);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export async function importShimmerItemTransforms(connection, contextCode, records, stats, shouldApply) {
  await importShimmerTableRows(connection, 'shimmer_item_transforms', contextCode, records, stats, shouldApply);
}

async function importShimmerDecraftRules(connection, contextCode, records, stats, shouldApply) {
  await importShimmerTableRows(connection, 'shimmer_decraft_rules', contextCode, records, stats, shouldApply);
}

async function importShimmerEntityTransforms(connection, contextCode, records, stats, shouldApply) {
  await importShimmerTableRows(connection, 'shimmer_entity_transforms', contextCode, records, stats, shouldApply);
}

async function importShimmerNpcTransforms(connection, contextCode, records, stats, shouldApply) {
  await importShimmerTableRows(connection, 'shimmer_npc_transforms', contextCode, records, stats, shouldApply);
}

async function importShimmerTableRows(connection, tableName, contextCode, records, stats, shouldApply) {
  const rows = buildShimmerTableInsertRows(tableName, contextCode, records);
  if (!shouldApply) {
    stats.created = rows.length;
    return;
  }
  await replaceSourceScopedRowsIfChanged(connection, tableName, SHIMMER_TABLE_COLUMNS[tableName], rows, stats);
}

function buildShimmerTableProjectionRows(bundle, contextCode) {
  return Object.fromEntries(SHIMMER_TABLE_NAMES.map((tableName) => {
    const rows = buildShimmerTableInsertRows(tableName, contextCode, importRecordsForTable(bundle, tableName));
    return [tableName, rows.map((row) => rowFromColumns(SHIMMER_TABLE_COLUMNS[tableName], row.payload))];
  }));
}

function buildShimmerTableInsertRows(tableName, contextCode, records) {
  const normalizedRecords = Array.isArray(records) ? records : [];
  return normalizedRecords.map((record, index) => {
    const sortOrder = index + 1;
    if (tableName === 'shimmer_item_transforms') {
      return {
        sql: `INSERT INTO shimmer_item_transforms
          (context_code, input_kind, input_name_en, input_name_zh, input_internal_name, output_kind, output_name_en, output_name_zh, output_internal_name, conditions_json, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        payload: [
          contextCode,
          toText(record?.inputKind) ?? 'item',
          toText(record?.inputNameEn),
          toText(record?.inputNameZh),
          toText(record?.inputInternalName),
          toText(record?.outputKind) ?? 'item',
          toText(record?.outputNameEn),
          toText(record?.outputNameZh),
          toText(record?.outputInternalName),
          JSON.stringify(Array.isArray(record?.conditions) ? record.conditions : []),
          toText(record?.notes),
          SHIMMER_PROVIDER,
          toText(record?.sourcePage) ?? SHIMMER_SOURCE_PAGE,
          toDateTime(record?.sourceRevisionTimestamp),
          sortOrder
        ]
      };
    }
    if (tableName === 'shimmer_decraft_rules') {
      return {
        sql: `INSERT INTO shimmer_decraft_rules
          (context_code, rule_type, group_label, input_kind, input_name_en, input_name_zh, input_internal_name, outputs_json, conditions_json, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        payload: [
          contextCode,
          toText(record?.ruleType),
          toText(record?.groupLabel),
          toText(record?.input?.kind) ?? 'item',
          toText(record?.input?.nameEn),
          toText(record?.input?.nameZh),
          toText(record?.input?.internalName),
          JSON.stringify(Array.isArray(record?.outputs) ? record.outputs : []),
          JSON.stringify(Array.isArray(record?.conditions) ? record.conditions : []),
          toText(record?.notes),
          SHIMMER_PROVIDER,
          toText(record?.sourcePage) ?? SHIMMER_SOURCE_PAGE,
          toDateTime(record?.sourceRevisionTimestamp),
          sortOrder
        ]
      };
    }
    if (tableName === 'shimmer_entity_transforms') {
      return {
        sql: `INSERT INTO shimmer_entity_transforms
          (context_code, transform_group, input_entity_type, input_name_en, input_name_zh, input_internal_name, output_entity_type, output_name_en, output_name_zh, output_internal_name, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        payload: [
          contextCode,
          toText(record?.transformGroup),
          toText(record?.input?.kind),
          toText(record?.input?.nameEn),
          toText(record?.input?.nameZh),
          toText(record?.input?.internalName),
          toText(record?.output?.kind),
          toText(record?.output?.nameEn),
          toText(record?.output?.nameZh),
          toText(record?.output?.internalName),
          SHIMMER_PROVIDER,
          toText(record?.sourcePage) ?? SHIMMER_SOURCE_PAGE,
          toDateTime(record?.sourceRevisionTimestamp),
          sortOrder
        ]
      };
    }
    if (tableName === 'shimmer_npc_transforms') {
      return {
        sql: `INSERT INTO shimmer_npc_transforms
          (context_code, npc_name_en, npc_name_zh, npc_internal_name, appearance_variant, effect_type, variant_image_url, variant_image_alt, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        payload: [
          contextCode,
          toText(record?.npc?.nameEn),
          toText(record?.npc?.nameZh),
          toText(record?.npc?.internalName),
          toText(record?.appearanceVariant),
          toText(record?.effectType),
          toText(record?.variantImageUrl),
          toText(record?.variantImageAlt),
          toText(record?.notes),
          SHIMMER_PROVIDER,
          toText(record?.sourcePage) ?? SHIMMER_SOURCE_PAGE,
          toDateTime(record?.sourceRevisionTimestamp),
          sortOrder
        ]
      };
    }
    throw new Error(`unsupported shimmer table projection: ${tableName}`);
  });
}

const SHIMMER_TABLE_COLUMNS = {
  shimmer_item_transforms: [
    'contextCode',
    'inputKind',
    'inputNameEn',
    'inputNameZh',
    'inputInternalName',
    'outputKind',
    'outputNameEn',
    'outputNameZh',
    'outputInternalName',
    'conditionsJson',
    'notes',
    'sourceProvider',
    'sourcePage',
    'sourceRevisionTimestamp',
    'sortOrder',
    'status',
    'deleted',
  ],
  shimmer_decraft_rules: [
    'contextCode',
    'ruleType',
    'groupLabel',
    'inputKind',
    'inputNameEn',
    'inputNameZh',
    'inputInternalName',
    'outputsJson',
    'conditionsJson',
    'notes',
    'sourceProvider',
    'sourcePage',
    'sourceRevisionTimestamp',
    'sortOrder',
    'status',
    'deleted',
  ],
  shimmer_entity_transforms: [
    'contextCode',
    'transformGroup',
    'inputEntityType',
    'inputNameEn',
    'inputNameZh',
    'inputInternalName',
    'outputEntityType',
    'outputNameEn',
    'outputNameZh',
    'outputInternalName',
    'sourceProvider',
    'sourcePage',
    'sourceRevisionTimestamp',
    'sortOrder',
    'status',
    'deleted',
  ],
  shimmer_npc_transforms: [
    'contextCode',
    'npcNameEn',
    'npcNameZh',
    'npcInternalName',
    'appearanceVariant',
    'effectType',
    'variantImageUrl',
    'variantImageAlt',
    'notes',
    'sourceProvider',
    'sourcePage',
    'sourceRevisionTimestamp',
    'sortOrder',
    'status',
    'deleted',
  ],
};

async function replaceSourceScopedRowsIfChanged(connection, tableName, columns, rows, stats) {
  const targetRows = rows.map((row) => rowFromColumns(columns, row.payload));
  const existingRows = await loadSourceScopedRows(connection, tableName);
  const targetHash = hashRows(tableName, targetRows);
  const existingHash = hashRows(tableName, existingRows);

  stats.scopeHashBefore = existingHash;
  stats.scopeHashTarget = targetHash;

  if (targetHash === existingHash) {
    stats.skipped = targetRows.length;
    stats.created = 0;
    stats.replaced = 0;
    return;
  }

  stats.replaced = existingRows.length;
  await connection.execute(
    `DELETE FROM ${tableName}
      WHERE deleted = 0
        AND COALESCE(source_provider, '') = 'wiki_zh'
        AND source_page = ?`,
    ['\u5fae\u5149']
  );
  for (const row of rows) {
    await connection.execute(row.sql, row.payload);
  }
  stats.created = rows.length;
}

async function loadSourceScopedRows(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT *
       FROM ${tableName}
      WHERE deleted = 0
        AND COALESCE(source_provider, '') = 'wiki_zh'
        AND source_page = ?
      ORDER BY sort_order ASC, id ASC`,
    ['\u5fae\u5149']
  );
  return rows.map((row) => normalizeShimmerDbRow(row));
}

function rowFromColumns(columns, payload) {
  const row = Object.fromEntries(columns.map((column, index) => [column, payload[index]]));
  row.status = 1;
  row.deleted = 0;
  return normalizeShimmerDbRow(row);
}

function normalizeShimmerDbRow(row) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !['id', 'created_at', 'createdAt', 'updated_at', 'updatedAt'].includes(key))
      .map(([key, value]) => [toCamelCase(key), normalizeHashValue(value)])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizeHashValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return toDateTime(value.toISOString());
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text)) return toDateTime(text);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text === '' ? null : text;
}

function hashRows(tableName, rows) {
  return crypto.createHash('sha256')
    .update(`v1:${tableName}:wiki_zh:微光:${JSON.stringify(rows)}`)
    .digest('hex');
}

function toCamelCase(value) {
  return String(value).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toSnakeCase(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function toDateTime(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}

function assertPrimaryDb(database, shouldApply, allowNonPrimary) {
  if (!shouldApply) {
    return;
  }
  if (String(database || '').trim() === 'terria_v1_local') {
    return;
  }
  if (allowNonPrimary) {
    return;
  }
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
