#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';

export const BUFF_IMAGE_PROJECTION_OPERATION_ID = 'canonical-buff-image-projection-patch';
export const EXPECTED_BUFF_IMAGE_PROJECTION_COUNT = 388;
export const BUFF_IMAGE_PROJECTION_WRITE_TARGETS = Object.freeze([
  'relation.projection_buffs.image',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DEFAULT_INPUT_PATH = 'reports/authorization/canonical/canonical-buff-image-projection-patch.input.json';
const DEFAULT_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/canonical-buff-image-projection-patch.preview.json';
const DEFAULT_RESULT_PATH = 'reports/authorization/canonical/canonical-buff-image-projection-patch.result.json';

export function computeBuffImageProjectionScopeHash(preview) {
  return hashJson(preview?.scope?.buff ?? null);
}

export function validateBuffImageProjectionInput({
  input,
  preview,
  previewSha256,
  expectedCount = EXPECTED_BUFF_IMAGE_PROJECTION_COUNT,
} = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== BUFF_IMAGE_PROJECTION_OPERATION_ID) {
    throw new Error('buff image projection input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('buff image projection write/network flags are invalid');
  }
  if (!preview || preview.schemaVersion !== 1 || preview.operationId !== BUFF_IMAGE_PROJECTION_OPERATION_ID
      || preview.applyAllowed !== false || preview.databaseWrites !== false || preview.externalRequests !== false) {
    throw new Error('buff image projection preview must be read-only and operation-bound');
  }
  if (!HASH_PATTERN.test(input.scopeSha256 ?? '') || input.scopeSha256 !== preview.scopeHash
      || computeBuffImageProjectionScopeHash(preview) !== preview.scopeHash) {
    throw new Error('buff image projection scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256 ?? '') || input.previewSha256 !== previewSha256) {
    throw new Error('buff image projection preview hash drifted');
  }
  if (!HASH_PATTERN.test(preview.evidence?.sha256 ?? '') || input.evidenceReportSha256 !== preview.evidence.sha256) {
    throw new Error('buff image projection evidence report hash drifted');
  }
  if (JSON.stringify(input.writeTargets) !== JSON.stringify(BUFF_IMAGE_PROJECTION_WRITE_TARGETS)) {
    throw new Error('buff image projection write targets drifted');
  }
  const rows = preview.scope?.buff?.rows;
  if (!Array.isArray(rows) || rows.length !== expectedCount || Number(preview.scope.buff.rowCount) !== expectedCount
      || preview.scope.buff.errors?.length !== 0) {
    throw new Error(`buff image projection scope count drifted: expected ${expectedCount}`);
  }
  if (Number(input.expectedCounts?.projection) !== expectedCount) throw new Error('buff image projection count drifted');
  const names = new Set();
  for (const row of rows) {
    const name = text(row?.internalName);
    if (!name || names.has(name)) throw new Error('buff image projection target identity is duplicated or missing');
    names.add(name);
    if (!Number.isInteger(Number(row?.relation?.id)) || !Number.isInteger(Number(row?.projection?.id))) {
      throw new Error(`buff image projection identity is incomplete: ${name}`);
    }
    if (text(row.relation.sourceProvider) !== 'terraria.wiki.gg' || !text(row.relation.cachedUrl)) {
      throw new Error(`buff image projection relation evidence is incomplete: ${name}`);
    }
    if (row.projection.beforeImage != null && text(row.projection.beforeImage)) {
      throw new Error(`buff image projection before image is not empty: ${name}`);
    }
    if (text(row.projection.afterImage) !== text(row.relation.cachedUrl)) {
      throw new Error(`buff image projection cached URL drifted: ${name}`);
    }
  }
  return true;
}

export function buildBuffImageProjectionMutationPlan(preview, { expectedCount = EXPECTED_BUFF_IMAGE_PROJECTION_COUNT } = {}) {
  const previewSha256 = `sha256:${'0'.repeat(64)}`;
  validateBuffImageProjectionInput({
    input: {
      schemaVersion: 1,
      operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: preview.scopeHash,
      previewSha256,
      evidenceReportSha256: preview.evidence.sha256,
      expectedCounts: { projection: expectedCount },
      writeTargets: BUFF_IMAGE_PROJECTION_WRITE_TARGETS,
    },
    preview,
    previewSha256,
    expectedCount,
  });
  return {
    scopeSha256: preview.scopeHash,
    rows: preview.scope.buff.rows.map((row) => ({
      internalName: row.internalName,
      relation: { id: Number(row.relation.id), sourceFileTitle: row.relation.sourceFileTitle, sourceProvider: row.relation.sourceProvider, cachedUrl: row.relation.cachedUrl, originalUrl: row.relation.originalUrl },
      projection: { id: Number(row.projection.id), beforeImage: row.projection.beforeImage, afterImage: row.projection.afterImage },
    })),
  };
}

export async function executeBuffImageProjectionTransaction({
  connection,
  input,
  plan,
  readCurrent = readBuffImageProjectionCurrentRows,
  readback = readBuffImageProjectionCurrentRows,
  consumeDispatchPermit,
} = {}) {
  if (!connection || typeof connection.beginTransaction !== 'function') throw new Error('database connection is required');
  if (!plan?.rows?.length) throw new Error('buff image projection mutation plan is required');
  if (typeof consumeDispatchPermit !== 'function') throw new Error('consumeDispatchPermit is required');
  const transaction = { began: false, permitConsumed: false, dmlAttempted: false, rolledBack: false };
  try {
    await connection.beginTransaction();
    transaction.began = true;
    const locked = await readCurrent(connection, plan, { forUpdate: true });
    assertCurrentRowsMatchPlan(locked, plan);
    await consumeDispatchPermit();
    transaction.permitConsumed = true;
    for (const row of plan.rows) {
      const result = await connection.execute(
        'UPDATE terria_v1_relation.projection_buffs SET image = ? WHERE id = ? AND internal_name = ? AND image IS NULL AND deleted = 0 AND status = 1',
        [row.projection.afterImage, row.projection.id, row.internalName],
      );
      transaction.dmlAttempted = true;
      if (Number(result?.[0]?.affectedRows) !== 1) throw new Error(`buff image projection affected row count drifted: ${row.internalName}`);
    }
    const after = await readback(connection, plan, { forUpdate: true });
    assertAfterRowsMatchPlan(after, plan);
    await connection.commit();
    return { scopeSha256: plan.scopeSha256, rowCount: plan.rows.length, transactionCommitted: true };
  } catch (error) {
    if (transaction.began) {
      await connection.rollback();
      transaction.rolledBack = true;
    }
    error.buffImageProjectionTransaction = transaction;
    throw error;
  }
}

export async function runBuffImageProjectionPatch({
  repoRoot = process.cwd(),
  inputPath = DEFAULT_INPUT_PATH,
  previewPath = DEFAULT_PREVIEW_PATH,
  outputPath = DEFAULT_RESULT_PATH,
  apply = false,
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const input = readRepositoryJson(root, inputPath, 'buff image projection input');
  const preview = readRepositoryJson(root, previewPath, 'buff image projection preview');
  validateBuffImageProjectionInput({ input, preview, previewSha256: hashFile(path.resolve(root, previewPath)) });
  const plan = buildBuffImageProjectionMutationPlan(preview);
  if (!apply) return { operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID, apply: false, scopeSha256: plan.scopeSha256, rowCount: plan.rows.length };
  assertExactOperationPaths({ inputPath, previewPath, outputPath });
  const authorizedContext = loadAuthorizedOperationContext({ operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext });
  const authorizedServerFingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    await assertServerFingerprint(connection, authorizedServerFingerprint);
    const result = await executeBuffImageProjectionTransaction({
      connection,
      input,
      plan,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
    });
    const payload = {
      schemaVersion: 1,
      resultKind: 'canonical_buff_image_projection_patch_result',
      operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID,
      status: 'COMPLETED',
      transactionCommitted: true,
      scopeSha256: result.scopeSha256,
      affected: { projection: plan.rows.length },
      authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
      completedAt: new Date().toISOString(),
    };
    writePrivateResult(root, outputPath, payload);
    return payload;
  } finally {
    await connection.end();
  }
}

export function assertCurrentRowsMatchPlan(current, plan) {
  const rows = current?.rows;
  if (!Array.isArray(rows) || rows.length !== plan.rows.length) throw new Error('buff image projection locked row count drifted');
  const byName = new Map(rows.map((row) => [row.internalName, row]));
  for (const expected of plan.rows) {
    const actual = byName.get(expected.internalName);
    if (!actual || Number(actual.relation?.id) !== expected.relation.id || Number(actual.projection?.id) !== expected.projection.id) {
      throw new Error(`buff image projection locked identity drifted: ${expected.internalName}`);
    }
    if (text(actual.relation?.cachedUrl) !== text(expected.relation.cachedUrl)
        || text(actual.relation?.sourceFileTitle) !== text(expected.relation.sourceFileTitle)
        || text(actual.relation?.sourceProvider) !== text(expected.relation.sourceProvider)
        || text(actual.relation?.originalUrl) !== text(expected.relation.originalUrl)) {
      throw new Error(`buff image projection relation source identity drifted: ${expected.internalName}`);
    }
    if (actual.projection?.beforeImage != null && text(actual.projection.beforeImage)) throw new Error(`buff image projection before image is not empty: ${expected.internalName}`);
  }
  return true;
}

export function assertAfterRowsMatchPlan(current, plan) {
  const rows = current?.rows;
  if (!Array.isArray(rows) || rows.length !== plan.rows.length) throw new Error('buff image projection readback row count drifted');
  const byName = new Map(rows.map((row) => [row.internalName, row]));
  for (const expected of plan.rows) {
    const actual = byName.get(expected.internalName);
    if (!actual || text(actual.projection?.image) !== text(expected.projection.afterImage)) {
      throw new Error(`buff image projection readback drifted: ${expected.internalName}`);
    }
    if (text(actual.relation?.cachedUrl) !== text(expected.relation.cachedUrl)
        || text(actual.relation?.sourceFileTitle) !== text(expected.relation.sourceFileTitle)
        || text(actual.relation?.sourceProvider) !== text(expected.relation.sourceProvider)
        || text(actual.relation?.originalUrl) !== text(expected.relation.originalUrl)) throw new Error(`buff image projection relation changed: ${expected.internalName}`);
  }
  return true;
}

export async function readBuffImageProjectionCurrentRows(connection, plan, { forUpdate = false } = {}) {
  const rows = [];
  for (const expected of plan.rows) {
    const [relationRows] = await connection.query(`SELECT id, buff_internal_name, source_file_title, source_provider, cached_url, original_url FROM terria_v1_relation.relation_buff_images WHERE id = ? AND deleted = 0 AND status = 1${forUpdate ? ' FOR UPDATE' : ''}`, [expected.relation.id]);
    const [projectionRows] = await connection.query(`SELECT id, internal_name, image FROM terria_v1_relation.projection_buffs WHERE id = ? AND deleted = 0 AND status = 1${forUpdate ? ' FOR UPDATE' : ''}`, [expected.projection.id]);
    if (relationRows.length !== 1 || projectionRows.length !== 1) throw new Error(`buff image projection row missing: ${expected.internalName}`);
    rows.push({
      internalName: expected.internalName,
      relation: { id: Number(relationRows[0].id), sourceFileTitle: relationRows[0].source_file_title, sourceProvider: relationRows[0].source_provider, originalUrl: relationRows[0].original_url, cachedUrl: relationRows[0].cached_url },
      projection: { id: Number(projectionRows[0].id), beforeImage: projectionRows[0].image, image: projectionRows[0].image },
    });
  }
  return { rows };
}

function hashJson(value) { return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`; }
function stableValue(value) { if (Array.isArray(value)) return value.map(stableValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])); }
function text(value) { const result = String(value ?? '').trim(); return result || null; }

function readRepositoryJson(repoRoot, relativePath, label) {
  const resolved = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label });
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function hashFile(filePath) { return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`; }

function assertExactOperationPaths({ inputPath, previewPath, outputPath }) {
  if (inputPath !== DEFAULT_INPUT_PATH || previewPath !== DEFAULT_PREVIEW_PATH || outputPath !== DEFAULT_RESULT_PATH) {
    throw new Error('buff image projection apply paths must match the governed operation manifest');
  }
}

function connectionOptions(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
}

async function assertServerFingerprint(connection, fingerprint) {
  const [rows] = await connection.query('SELECT @@server_uuid AS server_uuid');
  if (text(rows?.[0]?.server_uuid) !== text(fingerprint?.serverUuid)) throw new Error('buff image projection database server fingerprint drifted');
}

function writePrivateResult(repoRoot, relativePath, payload) {
  const target = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'buff image projection result', createParent: true });
  if (fs.existsSync(target)) throw new Error('buff image projection result already exists');
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function parseArgs(argv) {
  const allowed = new Set(['input', 'preview', 'output', 'apply']);
  const output = {};
  for (const token of argv) {
    if (!token.startsWith('--')) throw new Error(`unsupported argument: ${token}`);
    const [key, ...rest] = token.slice(2).split('=');
    if (!allowed.has(key) || rest.length === 0) throw new Error(`unsupported argument: ${token}`);
    output[key] = rest.join('=');
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runBuffImageProjectionPatch({
      inputPath: args.input ?? DEFAULT_INPUT_PATH,
      previewPath: args.preview ?? DEFAULT_PREVIEW_PATH,
      outputPath: args.output ?? DEFAULT_RESULT_PATH,
      apply: args.apply === 'true',
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
