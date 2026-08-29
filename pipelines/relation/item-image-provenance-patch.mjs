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

export const ITEM_IMAGE_PROVENANCE_OPERATION_ID = 'canonical-item-image-provenance-patch';
export const EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT = 2117;
export const ITEM_IMAGE_PROVENANCE_WRITE_TARGETS = Object.freeze([
  'maint.maint_item_images.source_page',
  'maint.maint_item_images.source_revision_timestamp',
  'maint.maint_item_images.original_url',
  'relation.relation_item_images.source_page',
  'relation.relation_item_images.source_revision_timestamp',
  'relation.relation_item_images.original_url',
  'local.item_images.source_page',
  'local.item_images.source_revision_timestamp',
  'local.item_images.original_url',
]);
const QUARANTINED = new Set(['FallenStar', 'SeveredHandBanner']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RELATION_DATABASE = 'terria_v1_relation';
const DEFAULT_INPUT_PATH = 'reports/authorization/canonical/canonical-item-image-provenance-patch.input.json';
const DEFAULT_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/canonical-item-image-provenance-patch.preview.json';
const DEFAULT_RESULT_PATH = 'reports/authorization/canonical/canonical-item-image-provenance-patch.result.json';
const ATTEMPT_ROOT_PREFIX = 'reports/authorization/canonical/item-image-provenance-patch/';

export function computeItemImageProvenanceScopeHash(preview) {
  return hashJson(preview?.scope?.item ?? null);
}

export function validateItemImageProvenanceInput({
  input,
  preview,
  previewSha256,
  expectedCount = EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT,
} = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== ITEM_IMAGE_PROVENANCE_OPERATION_ID) {
    throw new Error('item image provenance input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('item image provenance write/network flags are invalid');
  }
  if (!preview || preview.schemaVersion !== 1 || preview.operationId !== ITEM_IMAGE_PROVENANCE_OPERATION_ID
      || preview.applyAllowed !== false || preview.databaseWrites !== false || preview.externalRequests !== false) {
    throw new Error('item image provenance preview must be read-only and operation-bound');
  }
  if (!HASH_PATTERN.test(input.scopeSha256 ?? '') || input.scopeSha256 !== preview.scopeHash
      || computeItemImageProvenanceScopeHash(preview) !== preview.scopeHash) {
    throw new Error('item image provenance scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256 ?? '') || input.previewSha256 !== previewSha256) {
    throw new Error('item image provenance preview hash drifted');
  }
  if (!HASH_PATTERN.test(preview.evidence?.sha256 ?? '') || input.evidenceReportSha256 !== preview.evidence.sha256) {
    throw new Error('item image provenance evidence report hash drifted');
  }
  if (JSON.stringify(input.writeTargets) !== JSON.stringify(ITEM_IMAGE_PROVENANCE_WRITE_TARGETS)) {
    throw new Error('item image provenance write targets drifted');
  }
  const rows = preview.scope?.item?.rows;
  if (!Array.isArray(rows) || rows.length !== expectedCount || Number(preview.scope.item.rowCount) !== expectedCount
      || preview.scope.item.errors?.length !== 0) {
    throw new Error(`item image provenance scope count drifted: expected ${expectedCount}`);
  }
  const counts = input.expectedCounts ?? {};
  for (const key of ['maint', 'relation', 'local']) {
    if (Number(counts[key]) !== expectedCount) throw new Error(`item image provenance ${key} count drifted`);
  }
  const names = new Set();
  for (const row of rows) {
    const name = text(row?.itemInternalName);
    if (!name || names.has(name)) throw new Error('item image provenance target identity is duplicated or missing');
    if (QUARANTINED.has(name)) throw new Error(`item image provenance target is quarantined: ${name}`);
    names.add(name);
    assertEvidenceRow(row);
  }
  return true;
}

export function buildItemImageProvenanceMutationPlan(preview, { expectedCount = EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT } = {}) {
  const previewSha256 = `sha256:${'0'.repeat(64)}`;
  validateItemImageProvenanceInput({
    input: {
      schemaVersion: 1,
      operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: preview.scopeHash,
      previewSha256,
      evidenceReportSha256: preview.evidence.sha256,
      expectedCounts: { maint: expectedCount, relation: expectedCount, local: expectedCount },
      writeTargets: ITEM_IMAGE_PROVENANCE_WRITE_TARGETS,
    },
    preview,
    previewSha256,
    expectedCount,
  });
  return {
    scopeSha256: preview.scopeHash,
    rows: preview.scope.item.rows.map((row) => ({
      itemInternalName: row.itemInternalName,
      sourceFileTitle: row.sourceFileTitle,
      sourceProvider: row.sourceProvider,
      rawEvidence: row.rawEvidence,
      maint: { id: Number(row.maint.id), recordKey: row.maint.recordKey, sourceFileTitle: row.sourceFileTitle, sourceProvider: row.sourceProvider },
      relation: { id: Number(row.relation.id), recordKey: row.relation.recordKey, sourceMaintId: Number(row.relation.sourceMaintId), sourceFileTitle: row.sourceFileTitle, sourceProvider: row.sourceProvider },
      local: { itemId: Number(row.local.itemId), imageId: Number(row.local.imageId), sourceFileTitle: row.sourceFileTitle, provider: 'wiki_gg' },
      before: { maint: row.maint.before, relation: row.relation.before, local: row.local.before },
      after: { maint: row.maint.after, relation: row.relation.after, local: row.local.after },
    })),
  };
}

export async function executeItemImageProvenanceTransaction({
  connection,
  input,
  plan,
  readCurrent = readItemImageProvenanceCurrentRows,
  readback = readItemImageProvenanceCurrentRows,
  consumeDispatchPermit,
  verifyRawEvidence = verifyRawEvidenceFiles,
} = {}) {
  if (!connection || typeof connection.beginTransaction !== 'function') throw new Error('database connection is required');
  if (!plan?.rows?.length) throw new Error('item image provenance mutation plan is required');
  if (typeof consumeDispatchPermit !== 'function') throw new Error('consumeDispatchPermit is required');
  const transaction = { began: false, permitConsumed: false, dmlAttempted: false, rolledBack: false };
  try {
    await connection.beginTransaction();
    transaction.began = true;
    const locked = await readCurrent(connection, plan, { forUpdate: true });
    assertCurrentRowsMatchPlan(locked, plan);
    for (const row of plan.rows) await verifyRawEvidence(row.rawEvidence);
    await consumeDispatchPermit();
    transaction.permitConsumed = true;
    for (const row of plan.rows) {
      const maint = await connection.execute(buildMaintUpdateSql(), maintParameters(row));
      requireAffected(maint, `maint ${row.itemInternalName}`);
      transaction.dmlAttempted = true;
      const relation = await connection.execute(buildRelationUpdateSql(), relationParameters(row));
      requireAffected(relation, `relation ${row.itemInternalName}`);
      const local = await connection.execute(buildLocalUpdateSql(), localParameters(row));
      requireAffected(local, `local ${row.itemInternalName}`);
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
    error.itemImageProvenanceTransaction = transaction;
    throw error;
  }
}

export async function runItemImageProvenancePatch({
  repoRoot = process.cwd(),
  inputPath = DEFAULT_INPUT_PATH,
  previewPath = DEFAULT_PREVIEW_PATH,
  outputPath = DEFAULT_RESULT_PATH,
  apply = false,
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const input = readRepositoryJson(root, inputPath, 'item image provenance input');
  const preview = readRepositoryJson(root, previewPath, 'item image provenance preview');
  validateItemImageProvenanceInput({
    input,
    preview,
    previewSha256: hashFile(path.resolve(root, previewPath)),
  });
  const plan = buildItemImageProvenanceMutationPlan(preview);
  if (!apply) return { operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID, apply: false, scopeSha256: plan.scopeSha256, rowCount: plan.rows.length };
  assertExactOperationPaths({ inputPath, previewPath, outputPath });
  const authorizedContext = loadAuthorizedOperationContext({ operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext });
  const authorizedServerFingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    await assertServerFingerprint(connection, authorizedServerFingerprint);
    const result = await executeItemImageProvenanceTransaction({
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
      resultKind: 'canonical_item_image_provenance_patch_result',
      operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID,
      status: 'COMPLETED',
      transactionCommitted: true,
      scopeSha256: result.scopeSha256,
      affected: { maint: plan.rows.length, relation: plan.rows.length, local: plan.rows.length },
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
  if (!Array.isArray(rows) || rows.length !== plan.rows.length) throw new Error('item image provenance locked row count drifted');
  const byName = new Map(rows.map((row) => [row.itemInternalName, row]));
  for (const expected of plan.rows) {
    const actual = byName.get(expected.itemInternalName);
    if (!actual) throw new Error(`item image provenance locked row missing: ${expected.itemInternalName}`);
    assertIdentity(actual, expected, 'locked');
    assertFields(actual.before?.maint, expected.before.maint, ['sourcePage', 'sourceRevisionTimestamp', 'originalUrl', 'cachedUrl', 'landingSourceId', 'landingSourceKey', 'landingContentHash'], expected.itemInternalName, 'maint');
    assertFields(actual.before?.relation, expected.before.relation, ['sourcePage', 'sourceRevisionTimestamp', 'originalUrl', 'cachedUrl', 'landingSourceId', 'landingSourceKey', 'landingContentHash'], expected.itemInternalName, 'relation');
    assertFields(actual.before?.local, expected.before.local, ['sourcePage', 'sourceRevisionTimestamp', 'originalUrl', 'cachedUrl'], expected.itemInternalName, 'local');
  }
  return true;
}

export function assertAfterRowsMatchPlan(current, plan) {
  const rows = current?.rows;
  if (!Array.isArray(rows) || rows.length !== plan.rows.length) throw new Error('item image provenance readback row count drifted');
  const byName = new Map(rows.map((row) => [row.itemInternalName, row]));
  for (const expected of plan.rows) {
    const actual = byName.get(expected.itemInternalName);
    if (!actual) throw new Error(`item image provenance readback row missing: ${expected.itemInternalName}`);
    assertIdentity(actual, expected, 'readback');
    assertFields(actual.after?.maint, expected.after.maint, ['sourcePage', 'sourceRevisionTimestamp', 'originalUrl', 'cachedUrl'], expected.itemInternalName, 'maint');
    assertFields(actual.after?.relation, expected.after.relation, ['sourcePage', 'sourceRevisionTimestamp', 'originalUrl', 'cachedUrl'], expected.itemInternalName, 'relation');
    assertFields(actual.after?.local, expected.after.local, ['sourcePage', 'sourceRevisionTimestamp', 'originalUrl', 'cachedUrl'], expected.itemInternalName, 'local');
  }
  return true;
}

function assertEvidenceRow(row) {
  if (!row?.maint?.id || !row?.relation?.id || !row?.local?.imageId || !HASH_PATTERN.test(row.rawEvidence?.rawFileSha256 ?? '')) {
    throw new Error(`item image provenance evidence is incomplete: ${row?.itemInternalName ?? 'unknown'}`);
  }
  if (text(row.sourceProvider) !== 'terraria.wiki.gg') throw new Error('item image provenance source provider drifted');
  const evidence = row.rawEvidence;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text(evidence.sourceRevisionTimestamp) ?? '')) {
    throw new Error('item image provenance revision timestamp must be ISO UTC');
  }
  const expected = { sourcePage: evidence.sourcePage, sourceRevisionTimestamp: evidence.sourceRevisionTimestamp, originalUrl: evidence.originalUrl };
  for (const layer of ['maint', 'relation', 'local']) {
    for (const key of Object.keys(expected)) {
      if (comparable(row[layer]?.after?.[key]) !== comparable(expected[key])) throw new Error(`item image provenance ${layer} evidence drifted`);
    }
    if (comparable(row[layer]?.before?.cachedUrl) !== comparable(row[layer]?.after?.cachedUrl)) throw new Error('item image provenance cached URL changed');
  }
  toMysqlDateTime(evidence.sourceRevisionTimestamp);
  if (text(row.relation?.after?.originalUrl) !== text(evidence.originalUrl)) throw new Error('item image provenance relation URL drifted');
}

function assertIdentity(actual, expected, phase) {
  if (Number(actual.maint?.id) !== expected.maint.id || Number(actual.relation?.id) !== expected.relation.id
      || Number(actual.local?.imageId) !== expected.local.imageId
      || text(actual.maint?.recordKey) !== text(expected.maint.recordKey)
      || text(actual.relation?.recordKey) !== text(expected.relation.recordKey)
      || text(actual.maint?.sourceFileTitle) !== text(expected.sourceFileTitle)
      || text(actual.relation?.sourceFileTitle) !== text(expected.sourceFileTitle)
      || text(actual.maint?.sourceProvider) !== text(expected.sourceProvider)
      || text(actual.relation?.sourceProvider) !== text(expected.sourceProvider)) {
    throw new Error(`item image provenance ${phase} identity drifted: ${expected.itemInternalName}`);
  }
}

function assertFields(actual, expected, fields, name, layer) {
  for (const field of fields) {
    if (comparable(actual?.[field]) !== comparable(expected?.[field])) throw new Error(`item image provenance ${layer} ${field} drifted: ${name}`);
  }
}

export async function readItemImageProvenanceCurrentRows(connection, plan, { forUpdate = false } = {}) {
  const rows = [];
  for (const expected of plan.rows) {
    const [maintRows] = await connection.query(`SELECT id, record_key, item_internal_name, source_file_title, source_provider, source_page, source_revision_timestamp, original_url, cached_url, landing_source_id, landing_source_key, landing_content_hash FROM terria_v1_maint.maint_item_images WHERE id = ? AND deleted = 0 AND status = 1${forUpdate ? ' FOR UPDATE' : ''}`, [expected.maint.id]);
    const [relationRows] = await connection.query(`SELECT id, record_key, item_internal_name, source_file_title, source_provider, source_page, source_revision_timestamp, original_url, cached_url, landing_source_id, landing_source_key, landing_content_hash FROM ${RELATION_DATABASE}.relation_item_images WHERE id = ? AND deleted = 0 AND status = 1${forUpdate ? ' FOR UPDATE' : ''}`, [expected.relation.id]);
    const [localRows] = await connection.query(`SELECT id, item_id, source_file_title, provider, source_page, source_revision_timestamp, original_url, cached_url FROM terria_v1_local.item_images WHERE id = ? AND deleted = 0 AND status = 1${forUpdate ? ' FOR UPDATE' : ''}`, [expected.local.imageId]);
    if (maintRows.length !== 1 || relationRows.length !== 1 || localRows.length !== 1) throw new Error(`item image provenance row missing: ${expected.itemInternalName}`);
    const m = maintRows[0]; const r = relationRows[0]; const l = localRows[0];
    rows.push({
      itemInternalName: expected.itemInternalName,
      maint: { id: Number(m.id), recordKey: m.record_key, sourceFileTitle: m.source_file_title, sourceProvider: m.source_provider },
      relation: { id: Number(r.id), recordKey: r.record_key, sourceFileTitle: r.source_file_title, sourceProvider: r.source_provider },
      local: { imageId: Number(l.id), itemId: Number(l.item_id), sourceFileTitle: l.source_file_title, provider: l.provider },
      before: { maint: mapMaint(m), relation: mapRelation(r), local: mapLocal(l) },
      after: { maint: mapMaint(m), relation: mapRelation(r), local: mapLocal(l) },
    });
  }
  return { rows };
}

function mapMaint(row) { return { sourcePage: row.source_page, sourceRevisionTimestamp: row.source_revision_timestamp, originalUrl: row.original_url, cachedUrl: row.cached_url, landingSourceId: Number(row.landing_source_id), landingSourceKey: row.landing_source_key, landingContentHash: row.landing_content_hash }; }
function mapRelation(row) { return { sourcePage: row.source_page, sourceRevisionTimestamp: row.source_revision_timestamp, originalUrl: row.original_url, cachedUrl: row.cached_url, landingSourceId: Number(row.landing_source_id), landingSourceKey: row.landing_source_key, landingContentHash: row.landing_content_hash }; }
function mapLocal(row) { return { sourcePage: row.source_page, sourceRevisionTimestamp: row.source_revision_timestamp, originalUrl: row.original_url, cachedUrl: row.cached_url }; }

async function verifyRawEvidenceFiles(evidence) {
  if (!evidence?.absolutePath) throw new Error(`raw image evidence path is missing: ${evidence?.sourceFile ?? 'unknown'}`);
  const bytes = fs.readFileSync(evidence.absolutePath);
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== evidence.rawFileSha256) throw new Error(`raw image evidence hash drifted: ${evidence.sourceFile}`);
}

function buildMaintUpdateSql() { return 'UPDATE terria_v1_maint.maint_item_images SET source_page = ?, source_revision_timestamp = ?, original_url = ? WHERE id = ? AND record_key = ? AND cached_url <=> ? AND source_file_title <=> ? AND source_provider = ? AND landing_source_id = ? AND landing_source_key = ? AND landing_content_hash = ? AND deleted = 0 AND status = 1'; }
function buildRelationUpdateSql() { return `UPDATE ${RELATION_DATABASE}.relation_item_images SET source_page = ?, source_revision_timestamp = ?, original_url = ? WHERE id = ? AND record_key = ? AND cached_url <=> ? AND source_file_title <=> ? AND source_provider = ? AND landing_source_id = ? AND landing_source_key = ? AND landing_content_hash = ? AND deleted = 0 AND status = 1`; }
function buildLocalUpdateSql() { return 'UPDATE terria_v1_local.item_images SET source_page = ?, source_revision_timestamp = ?, original_url = ? WHERE id = ? AND item_id = ? AND cached_url <=> ? AND source_file_title <=> ? AND provider = ? AND deleted = 0 AND status = 1'; }
function maintParameters(row) { const b = row.before.maint; const a = row.after.maint; return [a.sourcePage, toMysqlDateTime(a.sourceRevisionTimestamp), a.originalUrl, row.maint.id, row.maint.recordKey, b.cachedUrl, row.sourceFileTitle, row.sourceProvider, b.landingSourceId, b.landingSourceKey, b.landingContentHash]; }
function relationParameters(row) { const b = row.before.relation; const a = row.after.relation; return [a.sourcePage, toMysqlDateTime(a.sourceRevisionTimestamp), a.originalUrl, row.relation.id, row.relation.recordKey, b.cachedUrl, row.sourceFileTitle, row.sourceProvider, b.landingSourceId, b.landingSourceKey, b.landingContentHash]; }
function localParameters(row) { const b = row.before.local; const a = row.after.local; return [a.sourcePage, toMysqlDateTime(a.sourceRevisionTimestamp), a.originalUrl, row.local.imageId, row.local.itemId, b.cachedUrl, row.sourceFileTitle, 'wiki_gg']; }
function requireAffected(result, label) { if (Number(result?.[0]?.affectedRows) !== 1) throw new Error(`item image provenance affected row count drifted: ${label}`); }
function text(value) { const result = String(value ?? '').trim(); return result || null; }
function toMysqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) throw new Error('item image provenance revision timestamp is invalid');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
function comparable(value) {
  if (value == null) return null;
  if (value instanceof Date) return `${formatLocalDateTime(value).replace(' ', 'T')}Z`;
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return `${normalized.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : `${date.toISOString().slice(0, 19)}Z`;
}
function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}
function hashJson(value) { return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`; }
function stableValue(value) { if (Array.isArray(value)) return value.map(stableValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])); }

function readRepositoryJson(repoRoot, relativePath, label) {
  const resolved = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label });
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function hashFile(filePath) { return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`; }

function assertExactOperationPaths({ inputPath, previewPath, outputPath }) {
  if (inputPath === DEFAULT_INPUT_PATH && previewPath === DEFAULT_PREVIEW_PATH && outputPath === DEFAULT_RESULT_PATH) return;
  const paths = [inputPath, previewPath, outputPath].map((value) => String(value ?? '').replaceAll('\\', '/'));
  const roots = paths.map((value) => value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '');
  if (!roots.every((root) => root.startsWith(ATTEMPT_ROOT_PREFIX) && /^[a-f0-9]{64}$/.test(root.slice(ATTEMPT_ROOT_PREFIX.length)))) {
    throw new Error('item image provenance apply paths must match the governed operation manifest');
  }
  if (new Set(roots).size !== 1 || !paths[0].endsWith('/input.json') || !paths[1].endsWith('/preview.json') || !paths[2].endsWith('/result.json')) {
    throw new Error('item image provenance attempt paths must share one exact attempt root');
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
  if (text(rows?.[0]?.server_uuid) !== text(fingerprint?.serverUuid)) throw new Error('item image provenance database server fingerprint drifted');
}

function writePrivateResult(repoRoot, relativePath, payload) {
  const target = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'item image provenance result', createParent: true });
  if (fs.existsSync(target)) throw new Error('item image provenance result already exists');
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
    const result = await runItemImageProvenancePatch({
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
