#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildCanonicalAuthorizationRequestForOperation,
} from '../automation/build-canonical-cutover-authorization.mjs';
import { canonicalServerFingerprint } from '../automation/automation-database-contract.mjs';
import {
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from '../automation/canonical-operation-execution-manifest.mjs';
import { canonicalizePolicySet } from '../automation/policy-set-hash.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import {
  BUFF_IMAGE_PROJECTION_OPERATION_ID,
  BUFF_IMAGE_PROJECTION_WRITE_TARGETS,
  EXPECTED_BUFF_IMAGE_PROJECTION_COUNT,
  buildBuffImageProjectionMutationPlan,
  computeBuffImageProjectionScopeHash,
  readBuffImageProjectionCurrentRows,
  assertCurrentRowsMatchPlan as assertBuffCurrentRowsMatchPlan,
} from './buff-image-projection-patch.mjs';
import {
  EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT,
  ITEM_IMAGE_PROVENANCE_OPERATION_ID,
  ITEM_IMAGE_PROVENANCE_WRITE_TARGETS,
  buildItemImageProvenanceMutationPlan,
  computeItemImageProvenanceScopeHash,
  readItemImageProvenanceCurrentRows,
  assertCurrentRowsMatchPlan as assertItemCurrentRowsMatchPlan,
} from './item-image-provenance-patch.mjs';

export const FROZEN_SCOPE_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-final/scheme-a-local-image-scope-preview.json';
export const FROZEN_PROVENANCE_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-final/item-image-original-url-provenance-preview.json';
export const IMAGE_AUTHORIZATION_ROOT = 'reports/runtime/local-data-chain-closure/20260820/image-provenance-closure';
const ITEM_PROVENANCE_FIELDS = Object.freeze([
  'sourceFile',
  'rawFileSha256',
  'pageId',
  'sourcePage',
  'sourceRevisionTimestamp',
  'originalUrl',
]);

export function buildItemImageProvenancePreview({
  scopePreview,
  provenanceReport,
  provenanceReportPath,
  provenanceReportSha256,
  expectedCount = EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT,
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceRows = scopePreview?.scope?.item?.rows;
  if (!Array.isArray(sourceRows) || sourceRows.length !== expectedCount) throw new Error(`frozen Item scope must contain ${expectedCount} rows`);
  for (const row of sourceRows) {
    if (row.itemInternalName === 'FallenStar' || row.itemInternalName === 'SeveredHandBanner') {
      throw new Error(`quarantined Item entered image scope: ${row.itemInternalName}`);
    }
  }
  const reconciliation = reconcileFrozenItemProvenanceEvidence({ scopePreview, provenanceReport, expectedCount });
  if (reconciliation.verdict !== 'pass') throw new Error('frozen Item scope evidence reconciliation is blocked');
  const evidenceByName = new Map((provenanceReport?.records ?? []).map((record) => [record?.item?.internalName, record]));
  const rows = sourceRows.map((row) => {
    if (row.itemInternalName === 'FallenStar' || row.itemInternalName === 'SeveredHandBanner') throw new Error(`quarantined Item entered image scope: ${row.itemInternalName}`);
    const evidence = evidenceByName.get(row.itemInternalName);
    if (evidence?.deterministicUrlVerdict !== 'recoverable_from_local_exact_evidence') throw new Error(`Item evidence is not exact: ${row.itemInternalName}`);
    return { ...row, rawEvidence: normalizeRawProvenanceEvidence(evidence.rawEvidence) };
  });
  const preview = {
    schemaVersion: 1,
    operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    frozenScopeSha256: scopePreview.scopeHash,
    evidence: { path: provenanceReportPath, sha256: provenanceReportSha256 },
    scope: { item: { rowCount: rows.length, rows, errors: [] } },
  };
  preview.scopeHash = computeItemImageProvenanceScopeHash(preview);
  buildItemImageProvenanceMutationPlan(preview, { expectedCount });
  return preview;
}

export function reconcileFrozenItemProvenanceEvidence({
  scopePreview,
  provenanceReport,
  expectedCount = EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT,
} = {}) {
  const sourceRows = scopePreview?.scope?.item?.rows;
  if (!Array.isArray(sourceRows) || sourceRows.length !== expectedCount) throw new Error(`frozen Item scope must contain ${expectedCount} rows`);
  const recordsByName = new Map();
  const duplicateReportIdentities = [];
  for (const record of provenanceReport?.records ?? []) {
    const itemInternalName = text(record?.item?.internalName);
    if (!itemInternalName) continue;
    if (recordsByName.has(itemInternalName)) duplicateReportIdentities.push(itemInternalName);
    else recordsByName.set(itemInternalName, record);
  }
  const frozenNames = new Set();
  const duplicateFrozenIdentities = [];
  const missingIdentities = [];
  const nonExactVerdicts = [];
  const invalidEvidence = [];
  const fieldMismatches = [];
  for (const row of sourceRows) {
    const itemInternalName = text(row?.itemInternalName);
    if (!itemInternalName || frozenNames.has(itemInternalName)) {
      duplicateFrozenIdentities.push(itemInternalName ?? 'missing');
      continue;
    }
    frozenNames.add(itemInternalName);
    const record = recordsByName.get(itemInternalName);
    if (!record) {
      missingIdentities.push(itemInternalName);
      continue;
    }
    if (record.deterministicUrlVerdict !== 'recoverable_from_local_exact_evidence') {
      nonExactVerdicts.push({ itemInternalName, verdict: record.deterministicUrlVerdict ?? null });
      continue;
    }
    let current;
    try {
      current = normalizeRawProvenanceEvidence(record.rawEvidence);
    } catch (error) {
      invalidEvidence.push({ itemInternalName, reason: error.message });
      continue;
    }
    for (const field of ITEM_PROVENANCE_FIELDS) {
      const frozen = row.rawEvidence?.[field] ?? null;
      if (comparable(frozen) !== comparable(current[field])) {
        fieldMismatches.push({ itemInternalName, field, frozen, current: current[field] });
      }
    }
  }
  const verdict = [
    duplicateFrozenIdentities,
    duplicateReportIdentities,
    missingIdentities,
    nonExactVerdicts,
    invalidEvidence,
    fieldMismatches,
  ].some((entries) => entries.length > 0) ? 'blocked' : 'pass';
  return {
    schemaVersion: 1,
    expectedItemCount: expectedCount,
    consumedIdentityCount: frozenNames.size,
    reportRecordCount: Array.isArray(provenanceReport?.records) ? provenanceReport.records.length : 0,
    duplicateFrozenIdentities,
    duplicateReportIdentities,
    missingIdentities,
    nonExactVerdicts,
    invalidEvidence,
    fieldMismatches,
    verdict,
  };
}

export function buildBuffImageProjectionPreview({
  scopePreview,
  evidencePath,
  evidenceSha256,
  expectedCount = EXPECTED_BUFF_IMAGE_PROJECTION_COUNT,
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceRows = scopePreview?.scope?.buff?.rows;
  if (!Array.isArray(sourceRows) || sourceRows.length !== expectedCount) throw new Error(`frozen Buff scope must contain ${expectedCount} rows`);
  const preview = {
    schemaVersion: 1,
    operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    frozenScopeSha256: scopePreview.scopeHash,
    evidence: { path: evidencePath, sha256: evidenceSha256 },
    scope: { buff: { rowCount: sourceRows.length, rows: sourceRows, errors: [] } },
  };
  preview.scopeHash = computeBuffImageProjectionScopeHash(preview);
  buildBuffImageProjectionMutationPlan(preview, { expectedCount });
  return preview;
}

export function buildImagePatchInputContract({ operationId, preview, previewSha256, expectedCounts, writeTargets } = {}) {
  if (![ITEM_IMAGE_PROVENANCE_OPERATION_ID, BUFF_IMAGE_PROJECTION_OPERATION_ID].includes(operationId)) throw new Error('unsupported image patch operation');
  return {
    schemaVersion: 1,
    operationId,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: preview.scopeHash,
    previewSha256,
    evidenceReportSha256: preview.evidence.sha256,
    expectedCounts,
    writeTargets: [...writeTargets],
  };
}

export async function prepareLocalImageProvenanceAuthorization({ repoRoot = process.cwd(), mysqlModule, generatedAt = new Date().toISOString() } = {}) {
  const root = path.resolve(repoRoot);
  const scopePreview = readJson(root, FROZEN_SCOPE_PATH);
  const provenanceReport = readJson(root, FROZEN_PROVENANCE_PATH);
  const scopeSha256 = hashFile(path.resolve(root, FROZEN_SCOPE_PATH));
  const provenanceSha256 = hashFile(path.resolve(root, FROZEN_PROVENANCE_PATH));
  const reconciliation = reconcileFrozenItemProvenanceEvidence({ scopePreview, provenanceReport });
  const reconciliationPath = `${IMAGE_AUTHORIZATION_ROOT}/item-image-provenance-evidence-reconciliation.json`;
  writePrivateJson(root, reconciliationPath, {
    schemaVersion: 1,
    generatedAt,
    readOnly: true,
    databaseWrites: false,
    externalRequests: false,
    frozenScope: {
      path: FROZEN_SCOPE_PATH,
      scopeHash: scopePreview.scopeHash,
      byteSha256: scopeSha256,
      referencedProvenanceReportSha256: scopePreview.inputs?.provenanceReportSha256 ?? null,
    },
    currentProvenanceReport: {
      path: FROZEN_PROVENANCE_PATH,
      byteSha256: provenanceSha256,
    },
    reconciliation,
  });
  if (reconciliation.verdict !== 'pass') throw new Error('frozen Item scope provenance evidence reconciliation is blocked');
  const itemPreview = buildItemImageProvenancePreview({ scopePreview, provenanceReport, provenanceReportPath: FROZEN_PROVENANCE_PATH, provenanceReportSha256: provenanceSha256, generatedAt });
  const buffPreview = buildBuffImageProjectionPreview({ scopePreview, evidencePath: FROZEN_SCOPE_PATH, evidenceSha256: scopeSha256, generatedAt });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let serverUuid;
  let policyRows;
  try {
    const [serverRows] = await connection.query('SELECT @@server_uuid AS server_uuid');
    serverUuid = String(serverRows?.[0]?.server_uuid ?? '').trim();
    if (!serverUuid) throw new Error('local database server UUID is missing');
    policyRows = await readCurrentAutomationPolicyRows(connection);
    const itemPlan = buildItemImageProvenanceMutationPlan(itemPreview);
    const itemCurrent = await readItemImageProvenanceCurrentRows(connection, itemPlan);
    assertItemCurrentRowsMatchPlan(itemCurrent, itemPlan);
    const buffPlan = buildBuffImageProjectionMutationPlan(buffPreview);
    const buffCurrent = await readBuffImageProjectionCurrentRows(connection, buffPlan);
    assertBuffCurrentRowsMatchPlan(buffCurrent, buffPlan);
  } finally {
    await connection.end();
  }
  const serverFingerprint = canonicalServerFingerprint({ host: process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? 13306), serverUuid, databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] });
  const outputs = [];
  for (const [operationId, preview, expectedCounts, writeTargets] of [
    [ITEM_IMAGE_PROVENANCE_OPERATION_ID, itemPreview, { maint: EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT, relation: EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT, local: EXPECTED_ITEM_IMAGE_PROVENANCE_COUNT }, ITEM_IMAGE_PROVENANCE_WRITE_TARGETS],
    [BUFF_IMAGE_PROJECTION_OPERATION_ID, buffPreview, { projection: EXPECTED_BUFF_IMAGE_PROJECTION_COUNT }, BUFF_IMAGE_PROJECTION_WRITE_TARGETS],
  ]) {
    const previewPath = `${IMAGE_AUTHORIZATION_ROOT}/${operationId}.preview.json`;
    const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
    const manifestPath = `reports/authorization/canonical/${operationId}.execution-manifest.json`;
    const requestPath = `reports/authorization/canonical/${operationId}.request.json`;
    writePrivateJson(root, previewPath, preview);
    const input = buildImagePatchInputContract({ operationId, preview, previewSha256: hashFile(path.resolve(root, previewPath)), expectedCounts, writeTargets });
    writePrivateJson(root, inputPath, input);
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: root, operationId, artifactDate: generatedAt.slice(0, 10) });
    writeCanonicalOperationExecutionManifest({ repoRoot: root, outputPath: path.resolve(root, manifestPath), operationId, artifactDate: generatedAt.slice(0, 10) });
    const request = buildCanonicalAuthorizationRequestForOperation({ repoRoot: root, operationId, serverFingerprint, policyRows, executionManifest: manifest, generatedAt, expiresAt: new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString() });
    writePrivateJson(root, requestPath, request);
    outputs.push({ operationId, scopeSha256: preview.scopeHash, previewSha256: hashFile(path.resolve(root, previewPath)), requestSha256: hashFile(path.resolve(root, requestPath)), counts: expectedCounts, previewPath, inputPath, manifestPath, requestPath });
  }
  return { schemaVersion: 1, generatedAt, source: { scopePath: FROZEN_SCOPE_PATH, scopeSha256, provenancePath: FROZEN_PROVENANCE_PATH, provenanceSha256, reconciliationPath }, serverFingerprint, outputs };
}

export async function readCurrentAutomationPolicyRows(connection) {
  if (!connection || typeof connection.query !== 'function') throw new Error('database connection query is required');
  const [rows] = await connection.query(
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, '
      + 'pv.policy_hash AS policyHash FROM terria_v1_local.crawler_automation_policy p '
      + 'JOIN terria_v1_local.crawler_automation_policy_version pv ON pv.domain_id = p.domain_id '
      + 'AND pv.policy_version = p.current_version ORDER BY p.domain_id',
  );
  const canonical = canonicalizePolicySet(rows ?? []);
  if (canonical.length === 0) throw new Error('current automation policy rows are missing');
  return canonical;
}

function normalizeRawProvenanceEvidence(rawEvidence) {
  const sourceFile = text(rawEvidence?.sourceFile);
  const absolutePath = text(rawEvidence?.absolutePath);
  const rawFileSha256 = text(rawEvidence?.rawFileSha256);
  const pageId = Number(rawEvidence?.pageId);
  const pageTitle = text(rawEvidence?.pageTitle ?? rawEvidence?.sourcePage);
  const revisionTimestamp = text(rawEvidence?.revisionTimestamp ?? rawEvidence?.sourceRevisionTimestamp);
  const candidateUrls = [...new Set((rawEvidence?.candidates ?? [])
    .map((candidate) => text(candidate?.url))
    .filter(Boolean))];
  const originalUrl = candidateUrls.length === 1 ? candidateUrls[0] : text(rawEvidence?.originalUrl);
  if (!sourceFile || !absolutePath || !/^sha256:[a-f0-9]{64}$/.test(rawFileSha256 ?? '') || !Number.isInteger(pageId)
      || pageId <= 0 || !pageTitle || !revisionTimestamp || !originalUrl || candidateUrls.length > 1) {
    throw new Error('raw provenance evidence is incomplete or ambiguous');
  }
  return {
    sourceFile,
    absolutePath,
    rawFileSha256,
    pageId,
    pageTitle,
    revisionTimestamp,
    sourcePage: pageTitle,
    sourceRevisionTimestamp: revisionTimestamp,
    originalUrl,
  };
}

function connectionOptions(repoRoot) { const config = loadLocalStackConfig(repoRoot); return { host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root' }; }
function readJson(repoRoot, relativePath) { return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8')); }
function hashFile(filePath) { return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`; }
function writePrivateJson(repoRoot, relativePath, value) { const target = path.resolve(repoRoot, relativePath); if (fs.existsSync(target)) throw new Error(`refusing to overwrite existing authorization material: ${relativePath}`); fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); }
function text(value) { const result = String(value ?? '').trim(); return result || null; }
function comparable(value) { return value == null ? null : String(value); }

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  prepareLocalImageProvenanceAuthorization().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
