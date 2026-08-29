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

export const TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID = 'canonical-two-item-image-quarantine-repair';
export const TWO_ITEM_IMAGE_QUARANTINE_REPAIR_INPUT_PATH = 'reports/authorization/canonical/canonical-two-item-image-quarantine-repair.input.json';
export const TWO_ITEM_IMAGE_QUARANTINE_REPAIR_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/two-item-quarantine-repair.preview.json';
export const TWO_ITEM_IMAGE_QUARANTINE_REPAIR_RESULT_PATH = 'reports/authorization/canonical/canonical-two-item-image-quarantine-repair.result.json';
const ATTEMPT_ROOT_PREFIX = 'reports/authorization/canonical/two-item-image-quarantine-repair/';

const EXPECTED_IDENTITIES = Object.freeze(['FallenStar', 'SeveredHandBanner']);

export function validateTwoItemImageQuarantineRepairPreview(preview) {
  if (preview?.schemaVersion !== 1 || preview.operationId !== TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID) {
    throw new Error('two-item image repair operation identity is invalid');
  }
  const rows = preview?.scope?.rows;
  if (!Array.isArray(rows) || rows.length !== EXPECTED_IDENTITIES.length) {
    throw new Error('two-item image repair must contain exactly two rows');
  }
  const names = rows.map((row) => String(row?.internalName ?? ''));
  if (JSON.stringify([...names].sort()) !== JSON.stringify([...EXPECTED_IDENTITIES].sort())) {
    throw new Error('two-item image repair identity set drifted');
  }
  for (const row of rows) {
    const replacement = row?.objectReplacement;
      if (row.internalName === 'FallenStar') {
      if (replacement != null) throw new Error('FallenStar object replacement is forbidden');
      if (row.layers?.maint?.beforeCachedUrl !== row.layers?.relation?.beforeCachedUrl
          || row.layers?.maint?.beforeCachedUrl !== row.layers?.local?.beforeCachedUrl
          || row.layers?.maint?.beforeCachedUrl !== row.layers?.projection?.beforeImage) {
        throw new Error('FallenStar cached URL lineage drifted');
      }
    } else {
      if (!replacement || replacement.contentType !== 'image/png' || replacement.width !== 12 || replacement.height !== 28
          || !/^sha256:[a-f0-9]{64}$/.test(replacement.sha256 ?? '') || !String(replacement.managedUrl ?? '').startsWith('/terrapedia-images/items/')) {
        throw new Error('SeveredHandBanner replacement evidence is invalid');
      }
    }
    for (const layer of ['maint', 'relation', 'local', 'projection']) {
      if (!Number.isInteger(Number(row.layers?.[layer]?.id))) throw new Error(`missing ${layer} row identity`);
    }
    if (!Number.isInteger(Number(row.layers?.item?.id))) throw new Error(`missing item row identity: ${row.internalName}`);
    if (!String(row.sourcePage ?? '').trim() || !/^2026-\d{2}-\d{2}T/.test(String(row.sourceRevisionTimestamp ?? ''))
        || !/^https:\/\/terraria\.wiki\.gg\/images\//.test(String(row.originalUrl ?? ''))) {
      throw new Error(`source evidence is invalid for ${row.internalName}`);
    }
  }
  return true;
}

export function buildTwoItemImageQuarantineRepairPlan(preview) {
  validateTwoItemImageQuarantineRepairPreview(preview);
  return {
    operationId: preview.operationId,
    scopeSha256: preview.scopeHash,
    rows: preview.scope.rows.map((row) => ({
      ...row,
      cachedUrlBefore: row.layers.maint.beforeCachedUrl,
      cachedUrlAfter: row.objectReplacement?.managedUrl ?? row.layers.maint.beforeCachedUrl,
      itemImageAfter: row.objectReplacement?.managedUrl ?? row.layers.item.beforeImage,
    })),
  };
}

export async function executeTwoItemImageQuarantineRepairTransaction({
  connection, plan, readCurrent, readback, consumeDispatchPermit,
} = {}) {
  if (!connection || typeof connection.beginTransaction !== 'function') throw new Error('database connection is required');
  if (!plan?.rows?.length || typeof readCurrent !== 'function' || typeof readback !== 'function') throw new Error('repair plan and row readers are required');
  if (typeof consumeDispatchPermit !== 'function') throw new Error('consumeDispatchPermit is required');
  const state = { began: false, permitConsumed: false, dmlAttempted: false, rolledBack: false };
  try {
    await connection.beginTransaction();
    state.began = true;
    const locked = await readCurrent(connection, plan, { forUpdate: true });
    assertRows(locked, plan, 'locked');
    await consumeDispatchPermit();
    state.permitConsumed = true;
    for (const row of plan.rows) {
      for (const statement of updateStatements(row)) {
        const [result] = await connection.execute(statement.sql, statement.parameters);
        state.dmlAttempted = true;
        if (Number(result?.affectedRows) !== 1) throw new Error('two-item image repair affected row count drifted: ' + row.internalName + ':' + statement.layer);
      }
    }
    const after = await readback(connection, plan, { forUpdate: true });
    assertRows(after, plan, 'after');
    await connection.commit();
    return { scopeSha256: plan.scopeSha256, rowCount: plan.rows.length, transactionCommitted: true };
  } catch (error) {
    if (state.began) { await connection.rollback(); state.rolledBack = true; }
    error.twoItemImageRepairTransaction = state;
    throw error;
  }
}

function assertRows(current, plan, phase) {
  const rows = current?.rows;
  if (!Array.isArray(rows) || rows.length !== plan.rows.length) throw new Error('two-item image repair ' + phase + ' row count drifted');
  const byName = new Map(rows.map((row) => [row.internalName, row]));
  for (const expected of plan.rows) {
    const actual = byName.get(expected.internalName);
    if (!actual) throw new Error('two-item image repair ' + phase + ' row missing: ' + expected.internalName);
    for (const layer of ['maint', 'relation', 'local', 'projection', 'item']) {
      if (Number(actual.layers?.[layer]?.id) !== Number(expected.layers?.[layer]?.id)) throw new Error('two-item image repair ' + phase + ' identity drifted: ' + expected.internalName);
    }
    if (phase === 'locked') {
      const provenanceDrift = actual.layers.maint.sourceFileTitle !== undefined
        && (actual.layers.maint.sourceFileTitle !== expected.layers.maint.beforeSourceFileTitle
          || actual.layers.relation.sourceFileTitle !== expected.layers.relation.beforeSourceFileTitle
          || actual.layers.local.sourceFileTitle !== expected.layers.local.beforeSourceFileTitle
          || actual.layers.maint.sourcePage !== expected.layers.maint.beforeSourcePage
          || actual.layers.relation.sourcePage !== expected.layers.relation.beforeSourcePage
          || actual.layers.local.sourcePage !== expected.layers.local.beforeSourcePage
          || comparable(actual.layers.maint.sourceRevisionTimestamp) !== comparable(expected.layers.maint.beforeSourceRevisionTimestamp)
          || comparable(actual.layers.relation.sourceRevisionTimestamp) !== comparable(expected.layers.relation.beforeSourceRevisionTimestamp)
          || comparable(actual.layers.local.sourceRevisionTimestamp) !== comparable(expected.layers.local.beforeSourceRevisionTimestamp)
          || actual.layers.maint.originalUrl !== expected.layers.maint.beforeOriginalUrl
          || actual.layers.relation.originalUrl !== expected.layers.relation.beforeOriginalUrl
          || actual.layers.local.originalUrl !== expected.layers.local.beforeOriginalUrl);
      if (provenanceDrift
          || actual.layers.maint.beforeCachedUrl !== expected.layers.maint.beforeCachedUrl
          || actual.layers.relation.beforeCachedUrl !== expected.layers.relation.beforeCachedUrl
          || actual.layers.local.beforeCachedUrl !== expected.layers.local.beforeCachedUrl
          || actual.layers.projection.beforeImage !== expected.layers.projection.beforeImage
          || actual.layers.item.beforeImage !== expected.layers.item.beforeImage) throw new Error('two-item image repair locked cached URL drifted: ' + expected.internalName);
    } else if ((actual.layers.maint.sourceFileTitle !== undefined && (actual.layers.maint.sourceFileTitle !== expected.sourceFileTitle
        || actual.layers.relation.sourceFileTitle !== expected.sourceFileTitle
        || actual.layers.local.sourceFileTitle !== expected.sourceFileTitle
        || actual.layers.maint.sourcePage !== expected.sourcePage
        || actual.layers.relation.sourcePage !== expected.sourcePage
        || actual.layers.local.sourcePage !== expected.sourcePage
        || comparable(actual.layers.maint.sourceRevisionTimestamp) !== comparable(expected.sourceRevisionTimestamp)
        || comparable(actual.layers.relation.sourceRevisionTimestamp) !== comparable(expected.sourceRevisionTimestamp)
        || comparable(actual.layers.local.sourceRevisionTimestamp) !== comparable(expected.sourceRevisionTimestamp)
        || actual.layers.maint.originalUrl !== expected.originalUrl
        || actual.layers.relation.originalUrl !== expected.originalUrl
        || actual.layers.local.originalUrl !== expected.originalUrl))
        || actual.layers.maint.afterCachedUrl !== expected.cachedUrlAfter
        || actual.layers.relation.afterCachedUrl !== expected.cachedUrlAfter
        || actual.layers.local.afterCachedUrl !== expected.cachedUrlAfter
        || actual.layers.projection.afterImage !== expected.cachedUrlAfter
        || actual.layers.item.afterImage !== expected.itemImageAfter) {
      throw new Error('two-item image repair after readback drifted: ' + expected.internalName + ' ' + JSON.stringify({ actual: actual.layers, expected: { sourceFileTitle: expected.sourceFileTitle, sourcePage: expected.sourcePage, sourceRevisionTimestamp: expected.sourceRevisionTimestamp, originalUrl: expected.originalUrl, cachedUrlAfter: expected.cachedUrlAfter, itemImageAfter: expected.itemImageAfter } }));
    }
  }
}

function updateStatements(row) {
  const metadata = [row.sourceFileTitle, row.sourcePage, new Date(row.sourceRevisionTimestamp).toISOString().slice(0, 19).replace('T', ' '), row.originalUrl];
  return [
    { layer: 'maint', sql: 'UPDATE terria_v1_maint.maint_item_images SET source_file_title=?, source_page=?, source_revision_timestamp=?, original_url=?, cached_url=? WHERE id=? AND source_file_title <=> ? AND source_page <=> ? AND source_revision_timestamp <=> ? AND original_url <=> ? AND cached_url <=> ? AND deleted=0 AND status=1', parameters: [...metadata, row.cachedUrlAfter, row.layers.maint.id, row.layers.maint.beforeSourceFileTitle, row.layers.maint.beforeSourcePage, toMysqlDateTime(row.layers.maint.beforeSourceRevisionTimestamp), row.layers.maint.beforeOriginalUrl, row.layers.maint.beforeCachedUrl] },
    { layer: 'relation', sql: 'UPDATE terria_v1_relation.relation_item_images SET source_file_title=?, source_page=?, source_revision_timestamp=?, original_url=?, cached_url=? WHERE id=? AND source_file_title <=> ? AND source_page <=> ? AND source_revision_timestamp <=> ? AND original_url <=> ? AND cached_url <=> ? AND deleted=0 AND status=1', parameters: [...metadata, row.cachedUrlAfter, row.layers.relation.id, row.layers.relation.beforeSourceFileTitle, row.layers.relation.beforeSourcePage, toMysqlDateTime(row.layers.relation.beforeSourceRevisionTimestamp), row.layers.relation.beforeOriginalUrl, row.layers.relation.beforeCachedUrl] },
    { layer: 'local', sql: 'UPDATE terria_v1_local.item_images SET source_file_title=?, source_page=?, source_revision_timestamp=?, original_url=?, cached_url=? WHERE id=? AND source_file_title <=> ? AND source_page <=> ? AND source_revision_timestamp <=> ? AND original_url <=> ? AND cached_url <=> ? AND deleted=0 AND status=1', parameters: [...metadata, row.cachedUrlAfter, row.layers.local.id, row.layers.local.beforeSourceFileTitle, row.layers.local.beforeSourcePage, toMysqlDateTime(row.layers.local.beforeSourceRevisionTimestamp), row.layers.local.beforeOriginalUrl, row.layers.local.beforeCachedUrl] },
    { layer: 'projection', sql: 'UPDATE terria_v1_relation.projection_items SET image=? WHERE id=? AND image <=> ? AND deleted=0 AND status=1', parameters: [row.cachedUrlAfter, row.layers.projection.id, row.layers.projection.beforeImage] },
    { layer: 'item', sql: 'UPDATE terria_v1_local.items SET image=? WHERE id=? AND image <=> ? AND deleted=0 AND status=1', parameters: [row.itemImageAfter, row.layers.item.id, row.layers.item.beforeImage] },
  ];
}

export async function readTwoItemImageQuarantineRepairCurrentRows(connection, plan, { forUpdate = false } = {}) {
  const rows = [];
  for (const expected of plan.rows) {
    const suffix = forUpdate ? ' FOR UPDATE' : '';
    const [m, r, l, p, i] = await Promise.all([
      connection.query(`SELECT id, item_internal_name, source_file_title, source_page, DATE_FORMAT(source_revision_timestamp,'%Y-%m-%dT%H:%i:%sZ') AS source_revision_timestamp, original_url, cached_url FROM terria_v1_maint.maint_item_images WHERE id=? AND deleted=0 AND status=1${suffix}`, [expected.layers.maint.id]),
      connection.query(`SELECT id, item_internal_name, source_file_title, source_page, DATE_FORMAT(source_revision_timestamp,'%Y-%m-%dT%H:%i:%sZ') AS source_revision_timestamp, original_url, cached_url FROM terria_v1_relation.relation_item_images WHERE id=? AND deleted=0 AND status=1${suffix}`, [expected.layers.relation.id]),
      connection.query(`SELECT id, item_id, source_file_title, source_page, DATE_FORMAT(source_revision_timestamp,'%Y-%m-%dT%H:%i:%sZ') AS source_revision_timestamp, original_url, cached_url FROM terria_v1_local.item_images WHERE id=? AND deleted=0 AND status=1${suffix}`, [expected.layers.local.id]),
      connection.query(`SELECT id, internal_name, image FROM terria_v1_relation.projection_items WHERE id=? AND deleted=0 AND status=1${suffix}`, [expected.layers.projection.id]),
      connection.query(`SELECT id, internal_name, image FROM terria_v1_local.items WHERE id=? AND deleted=0 AND status=1${suffix}`, [expected.layers.item.id]),
    ]).then((results) => results.map(([values]) => values?.[0]));
    if (![m, r, l, p, i].every(Boolean)) throw new Error(`two-item image repair row missing: ${expected.internalName}`);
    rows.push({
      internalName: expected.internalName,
      layers: {
        maint: { id: Number(m.id), sourceFileTitle: m.source_file_title, sourcePage: m.source_page, sourceRevisionTimestamp: m.source_revision_timestamp, originalUrl: m.original_url, beforeCachedUrl: m.cached_url, afterCachedUrl: m.cached_url },
        relation: { id: Number(r.id), sourceFileTitle: r.source_file_title, sourcePage: r.source_page, sourceRevisionTimestamp: r.source_revision_timestamp, originalUrl: r.original_url, beforeCachedUrl: r.cached_url, afterCachedUrl: r.cached_url },
        local: { id: Number(l.id), sourceFileTitle: l.source_file_title, sourcePage: l.source_page, sourceRevisionTimestamp: l.source_revision_timestamp, originalUrl: l.original_url, beforeCachedUrl: l.cached_url, afterCachedUrl: l.cached_url },
        projection: { id: Number(p.id), beforeImage: p.image, afterImage: p.image },
        item: { id: Number(i.id), beforeImage: i.image, afterImage: i.image },
      },
    });
  }
  return { rows };
}

function comparable(value) {
  if (value == null) return null;
  const date = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 19) + 'Z';
}

function toMysqlDateTime(value) {
  if (value == null) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('two-item repair revision timestamp is invalid');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export async function runTwoItemImageQuarantineRepair({
  repoRoot = process.cwd(), inputPath = TWO_ITEM_IMAGE_QUARANTINE_REPAIR_INPUT_PATH,
  previewPath = TWO_ITEM_IMAGE_QUARANTINE_REPAIR_PREVIEW_PATH,
  outputPath = TWO_ITEM_IMAGE_QUARANTINE_REPAIR_RESULT_PATH, apply = false, mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const input = readJson(root, inputPath, 'two-item image repair input');
  const preview = readJson(root, previewPath, 'two-item image repair preview');
  validateTwoItemImageQuarantineRepairInput({ input, preview, previewSha256: hashFile(path.resolve(root, previewPath)) });
  const plan = buildTwoItemImageQuarantineRepairPlan(preview);
  if (!apply) return { operationId: TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID, apply: false, rowCount: plan.rows.length, scopeSha256: input.scopeSha256 };
  assertApplyPaths({ inputPath, previewPath, outputPath });
  const authorizedContext = loadAuthorizedOperationContext({ operationId: TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    const [serverRows] = await connection.query('SELECT @@server_uuid AS server_uuid');
    if (String(serverRows?.[0]?.server_uuid) !== String(fingerprint.serverUuid)) throw new Error('two-item repair database server fingerprint drifted');
    const result = await executeTwoItemImageQuarantineRepairTransaction({ connection, plan,
      readCurrent: readTwoItemImageQuarantineRepairCurrentRows,
      readback: readTwoItemImageQuarantineRepairCurrentRows,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({ authorizedContext, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }),
    });
    const payload = { schemaVersion: 1, resultKind: 'canonical_two_item_image_quarantine_repair_result', operationId: TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID, status: 'COMPLETED', transactionCommitted: true, scopeSha256: result.scopeSha256 ?? input.scopeSha256, affected: { maint: 2, relation: 2, local: 2, projection: 1, item: 1 }, authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash }, completedAt: new Date().toISOString() };
    writePrivateResult(root, outputPath, payload);
    return payload;
  } finally { await connection.end(); }
}

function assertApplyPaths({ inputPath, previewPath, outputPath }) {
  if (inputPath === TWO_ITEM_IMAGE_QUARANTINE_REPAIR_INPUT_PATH && previewPath === TWO_ITEM_IMAGE_QUARANTINE_REPAIR_PREVIEW_PATH && outputPath === TWO_ITEM_IMAGE_QUARANTINE_REPAIR_RESULT_PATH) return;
  const paths = [inputPath, previewPath, outputPath].map((value) => String(value ?? '').replaceAll('\\', '/'));
  const roots = paths.map((value) => value.slice(0, value.lastIndexOf('/')));
  if (!roots.every((root) => root.startsWith(ATTEMPT_ROOT_PREFIX) && /^[a-f0-9]{64}$/.test(root.slice(ATTEMPT_ROOT_PREFIX.length))) || new Set(roots).size !== 1 || !paths[0].endsWith('/input.json') || !paths[1].endsWith('/preview.json') || !paths[2].endsWith('/result.json')) throw new Error('two-item repair paths must match the governed manifest');
}

export function validateTwoItemImageQuarantineRepairInput({ input, preview, previewSha256 }) {
  validateTwoItemImageQuarantineRepairPreview(preview);
  if (input?.schemaVersion !== 1 || input.operationId !== TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID || input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) throw new Error('two-item repair input contract is invalid');
  if (input.scopeSha256 !== preview.scopeHash || input.previewSha256 !== previewSha256 || hashJson(preview.scope) !== preview.scopeHash) throw new Error('two-item repair input hash drifted');
  if (!Array.isArray(input.writeTargets) || input.writeTargets.length !== 17) throw new Error('two-item repair write targets drifted');
  return true;
}

function connectionOptions(repoRoot) { const config = loadLocalStackConfig(repoRoot); return { host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root' }; }
function hashJson(value) { return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`; }
function stableValue(value) { if (Array.isArray(value)) return value.map(stableValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])); }
function hashFile(filePath) { return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`; }
function readJson(repoRoot, relativePath, label) { const file = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label }); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writePrivateResult(repoRoot, relativePath, payload) { const file = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'two-item repair result', createParent: true }); fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); }

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  runTwoItemImageQuarantineRepair({ inputPath: args.input ?? TWO_ITEM_IMAGE_QUARANTINE_REPAIR_INPUT_PATH, previewPath: args.preview ?? TWO_ITEM_IMAGE_QUARANTINE_REPAIR_PREVIEW_PATH, outputPath: args.output ?? TWO_ITEM_IMAGE_QUARANTINE_REPAIR_RESULT_PATH, apply: args.apply === 'true' }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
