#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { buildCanonicalAuthorizationRequestForOperation } from '../automation/build-canonical-cutover-authorization.mjs';
import {
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from '../automation/canonical-operation-execution-manifest.mjs';
import { FORMAL_DATABASES, canonicalServerFingerprint } from '../automation/automation-database-contract.mjs';
import { canonicalizePolicySet } from '../automation/policy-set-hash.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { resolveManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

export const ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID = 'canonical-armor-set-projection-restoration';
export const ARMOR_SET_PROJECTION_RESTORATION_EXPECTED_COUNT = 63;
export const ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH =
  'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/armor-set-projection-restoration.retry-02.proposal.json';
export const ARMOR_SET_PROJECTION_RESTORATION_AUTHORIZATION_DATABASES = Object.freeze(
  Object.values(FORMAL_DATABASES),
);
export const ARMOR_SET_PROJECTION_RESTORATION_INPUT_PATH =
  'reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.input.json';
export const ARMOR_SET_PROJECTION_RESTORATION_MANIFEST_PATH =
  'reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.execution-manifest.json';
export const ARMOR_SET_PROJECTION_RESTORATION_REQUEST_PATH =
  'reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.request.json';
export const ARMOR_SET_PROJECTION_RESTORATION_RESULT_PATH =
  'reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.result.json';
const WRITE_TARGETS = Object.freeze(['relation.projection_armor_sets.insert']);
const EXPECTED_SOURCE_COUNTS = Object.freeze({
  relationArmorSets: 63,
  relationArmorSetItems: 470,
  relationArmorSetImages: 175,
  relationArmorAttributeRows: 246,
  relationEquipmentEffectAttributes: 320,
});

const TARGET_COLUMNS = Object.freeze([
  'id',
  'relation_record_key',
  'text_key',
  'entity_type',
  'composition_kind',
  'name',
  'name_zh',
  'name_en',
  'source_key',
  'benefit_expression',
  'benefit_zh',
  'benefit_en',
  'primary_part',
  'set_count',
  'unique_item_count',
  'sets_json',
  'unique_item_ids_json',
  'current_item_ids_json',
  'related_items_json',
  'male_images',
  'female_images',
  'special_images',
  'mapping_status',
  'source_provider',
  'source_page',
  'source_revision_timestamp',
  'status',
  'deleted',
  'created_at',
  'updated_at',
]);

const ARMOR_ROW_FIELDS = Object.freeze(TARGET_COLUMNS.map(toCamel));
const SOURCE_TABLES = Object.freeze({
  relationItems: 'terria_v1_relation.relation_items',
  relationItemImages: 'terria_v1_relation.relation_item_images',
  relationArmorSets: 'terria_v1_relation.relation_armor_sets',
  relationArmorSetItems: 'terria_v1_relation.relation_armor_set_items',
  relationArmorSetImages: 'terria_v1_relation.relation_armor_set_images',
  relationArmorAttributeRows: 'terria_v1_relation.relation_armor_attribute_rows',
  relationEquipmentEffectAttributes: 'terria_v1_relation.relation_equipment_effect_attributes',
});

export function buildArmorSetProjectionRestorationProposal({
  beforeRows = [],
  derivedRows = [],
  sourceCounts = {},
  sourceSnapshotSha256,
  authorityKind = 'current_relation_chain',
  expectedCount = ARMOR_SET_PROJECTION_RESTORATION_EXPECTED_COUNT,
  serverUuid,
  managedImageUrlPrefixes = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  if (authorityKind !== 'current_relation_chain') {
    throw new Error('Armor projection restoration authority must not use a historical backup');
  }
  if (!Array.isArray(beforeRows) || beforeRows.length !== 0) {
    throw new Error('Armor projection restoration requires an empty before set');
  }
  if (!isUuid(serverUuid) || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Armor projection restoration fingerprint or generatedAt is invalid');
  }
  const rows = normalizeArmorRows(derivedRows);
  if (!Number.isInteger(expectedCount) || rows.length !== expectedCount) {
    throw new Error(`Armor projection restoration count drifted: expected ${expectedCount}, found ${rows.length}`);
  }
  assertUniqueArmorKeys(rows);
  validateSourceCounts(sourceCounts, expectedCount);
  const snapshotHash = sourceSnapshotSha256 ?? hashJson({ sourceCounts, rows });
  if (!isHash(snapshotHash)) throw new Error('Armor projection restoration source snapshot hash is invalid');
  const keys = rows.map((row) => row.textKey);
  const proposal = {
    schemaVersion: 1,
    proposalKind: 'canonical_armor_set_projection_restoration',
    operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    authorityKind,
    serverFingerprint: { serverUuid, databases: ['terria_v1_relation'] },
    source: {
      tables: { ...SOURCE_TABLES },
      counts: stableValue(sourceCounts),
      sourceSnapshotSha256: snapshotHash,
      managedImageUrlPrefixes: [...managedImageUrlPrefixes],
      historical88RowBackupUsedAsAuthority: false,
    },
    target: {
      database: 'terria_v1_relation',
      table: 'terria_v1_relation.projection_armor_sets',
      writeTargets: [...WRITE_TARGETS],
      mutationMode: 'insert-only-empty-table',
    },
    columns: [...TARGET_COLUMNS],
    expectedRowCount: expectedCount,
    changedRowCount: rows.length,
    keys,
    keySetSha256: hashJson(keys),
    before: { rowCount: 0, rowsSha256: hashJson([]) },
    after: { rowCount: rows.length, rowsSha256: hashJson(rows) },
    rows,
  };
  proposal.scopeSha256 = computeScopeHash(proposal);
  validateArmorSetProjectionRestorationProposal(proposal, { expectedCount });
  return proposal;
}

export function validateArmorSetProjectionRestorationProposal(proposal, { expectedCount } = {}) {
  const count = expectedCount ?? proposal?.expectedRowCount ?? ARMOR_SET_PROJECTION_RESTORATION_EXPECTED_COUNT;
  if (proposal?.schemaVersion !== 1
      || proposal.proposalKind !== 'canonical_armor_set_projection_restoration'
      || proposal.operationId !== ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID
      || proposal.applyAllowed !== false
      || proposal.databaseWrites !== false
      || proposal.externalRequests !== false
      || proposal.authorityKind !== 'current_relation_chain'
      || proposal.source?.historical88RowBackupUsedAsAuthority !== false) {
    throw new Error('Armor projection restoration proposal identity or authority is invalid');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || proposal.target?.table !== 'terria_v1_relation.projection_armor_sets'
      || proposal.target?.mutationMode !== 'insert-only-empty-table'
      || stableString(proposal.target?.writeTargets) !== stableString(WRITE_TARGETS)
      || stableString(proposal.columns) !== stableString(TARGET_COLUMNS)) {
    throw new Error('Armor projection restoration target drifted');
  }
  const rows = normalizeArmorRows(proposal.rows);
  if (rows.length !== count || proposal.changedRowCount !== count
      || proposal.before?.rowCount !== 0 || proposal.after?.rowCount !== count) {
    throw new Error(`Armor projection restoration count drifted: expected ${count}`);
  }
  assertUniqueArmorKeys(rows);
  validateSourceCounts(proposal.source?.counts ?? {}, count);
  const keys = rows.map((row) => row.textKey);
  if (!isHash(proposal.source?.sourceSnapshotSha256)
      || proposal.keySetSha256 !== hashJson(keys)
      || proposal.before.rowsSha256 !== hashJson([])
      || proposal.after.rowsSha256 !== hashJson(rows)
      || proposal.scopeSha256 !== computeScopeHash(proposal)) {
    throw new Error('Armor projection restoration proposal hash drifted');
  }
  return true;
}

export async function executeArmorSetProjectionRestorationTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
  readCurrent = readArmorProjectionRows,
  readSourceSnapshotHash = readCurrentArmorSourceSnapshotHash,
  insertRows = insertArmorProjectionRows,
} = {}) {
  validateArmorSetProjectionRestorationProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof consumeDispatchPermit !== 'function') {
    throw new Error('Armor projection restoration transaction dependencies are missing');
  }
  let began = false;
  try {
    await connection.beginTransaction();
    began = true;
    const sourceHash = await readSourceSnapshotHash(connection, proposal, { forUpdate: true });
    if (sourceHash !== proposal.source.sourceSnapshotSha256) {
      throw new Error('Armor projection restoration source snapshot drifted after lock');
    }
    const before = normalizeArmorRows(await readCurrent(connection, proposal, { forUpdate: true, after: false }));
    if (hashJson(before) !== proposal.before.rowsSha256) {
      throw new Error('Armor projection restoration before set drifted after lock');
    }
    await consumeDispatchPermit();
    const affectedRows = Number(await insertRows(connection, proposal.rows));
    if (affectedRows !== proposal.changedRowCount) {
      throw new Error('Armor projection restoration affected row count drifted');
    }
    const after = normalizeArmorRows(await readCurrent(connection, proposal, { forUpdate: true, after: true }));
    if (hashJson(after) !== proposal.after.rowsSha256) {
      throw new Error(`Armor projection restoration transaction readback drifted: ${describeArmorRowDrift(proposal.rows, after)}`);
    }
    await connection.commit();
    return { transactionCommitted: true, affectedRows, afterRowsSha256: proposal.after.rowsSha256 };
  } catch (error) {
    if (began) await connection.rollback();
    throw error;
  }
}

function describeArmorRowDrift(expectedRows, actualRows) {
  const expected = normalizeArmorRows(expectedRows);
  const actual = normalizeArmorRows(actualRows);
  for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (stableString(left) !== stableString(right)) {
      const fields = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
      for (const field of fields) {
        if (stableString(left?.[field]) !== stableString(right?.[field])) {
          return `row=${index} field=${field} expected=${JSON.stringify(left?.[field])} actual=${JSON.stringify(right?.[field])}`;
        }
      }
      return `row=${index} differs`;
    }
  }
  return `expectedRows=${expected.length} actualRows=${actual.length}`;
}

export async function prepareArmorSetProjectionRestorationProposal({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  assertFresh(root, [ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH]);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [server, sourceRows, beforeRows] = await Promise.all([
      readRows(connection, 'SELECT @@server_uuid AS serverUuid'),
      readArmorSourceRows(connection),
      readArmorProjectionRows(connection, null, {}),
    ]);
    const managedImageUrlPrefixes = resolveManagedImageUrlPrefixes({ repoRoot: root });
    const payload = buildProjectionPayload({
      ...Object.fromEntries(Object.entries(sourceRows).map(([key, rows]) => [key, rows.map(toCamelRow)])),
      managedImageUrlPrefixes,
    });
    const sourceCounts = Object.fromEntries(Object.entries(sourceRows).map(([key, rows]) => [key, rows.length]));
    proposal = buildArmorSetProjectionRestorationProposal({
      beforeRows,
      derivedRows: payload.projectionArmorSets,
      sourceCounts,
      sourceSnapshotSha256: hashJson(sourceRows),
      serverUuid: server[0]?.serverUuid,
      managedImageUrlPrefixes,
      generatedAt,
    });
    await connection.query('ROLLBACK');
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
  writePrivateJson(root, ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH, proposal);
  return {
    operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
    changedRowCount: proposal.changedRowCount,
    scopeSha256: proposal.scopeSha256,
    proposalSha256: hashFile(path.resolve(root, ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH)),
    proposalPath: ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH,
  };
}

export async function prepareArmorSetProjectionRestorationAuthorization({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  assertFresh(root, [
    ARMOR_SET_PROJECTION_RESTORATION_INPUT_PATH,
    ARMOR_SET_PROJECTION_RESTORATION_MANIFEST_PATH,
    ARMOR_SET_PROJECTION_RESTORATION_REQUEST_PATH,
    ARMOR_SET_PROJECTION_RESTORATION_RESULT_PATH,
  ]);
  const proposal = readJson(root, ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH);
  validateArmorSetProjectionRestorationProposal(proposal);
  const proposalSha256 = hashFile(path.resolve(root, ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH));
  const input = buildInput(proposal, proposalSha256);
  writePrivateJson(root, ARMOR_SET_PROJECTION_RESTORATION_INPUT_PATH, input);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: root,
    operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
    artifactDate: generatedAt.slice(0, 10),
  });
  writeCanonicalOperationExecutionManifest({
    repoRoot: root,
    outputPath: path.resolve(root, ARMOR_SET_PROJECTION_RESTORATION_MANIFEST_PATH),
    operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
    artifactDate: generatedAt.slice(0, 10),
  });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let policyRows;
  try {
    policyRows = await readCurrentAutomationPolicyRows(connection);
  } finally {
    await connection.end();
  }
  const options = connectionOptions(root);
  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot: root,
    operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
    serverFingerprint: canonicalServerFingerprint({
      host: options.host,
      port: options.port,
      serverUuid: proposal.serverFingerprint.serverUuid,
      databases: ARMOR_SET_PROJECTION_RESTORATION_AUTHORIZATION_DATABASES,
    }),
    policyRows,
    executionManifest: manifest,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
  });
  writePrivateJson(root, ARMOR_SET_PROJECTION_RESTORATION_REQUEST_PATH, request);
  return { operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID, proposalSha256, scopeSha256: proposal.scopeSha256 };
}

export async function applyArmorSetProjectionRestoration({
  repoRoot = process.cwd(),
  now = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const proposal = readJson(root, ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH);
  const input = readJson(root, ARMOR_SET_PROJECTION_RESTORATION_INPUT_PATH);
  validateInput(input, proposal, hashFile(path.resolve(root, ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH)));
  const context = loadAuthorizedOperationContext({ operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    const server = await readRows(connection, 'SELECT @@server_uuid AS serverUuid');
    if (server[0]?.serverUuid !== fingerprint.serverUuid
        || fingerprint.serverUuid !== proposal.serverFingerprint.serverUuid) {
      throw new Error('Armor projection restoration database fingerprint drifted');
    }
    const transaction = await executeArmorSetProjectionRestorationTransaction({
      connection,
      proposal,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
    });
    const result = {
      schemaVersion: 1,
      resultKind: 'canonical_armor_set_projection_restoration_result',
      operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
      status: 'COMPLETED',
      transactionCommitted: true,
      affectedRows: transaction.affectedRows,
      scopeSha256: proposal.scopeSha256,
      afterRowsSha256: transaction.afterRowsSha256,
      authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
      completedAt: now,
    };
    writePrivateJson(root, ARMOR_SET_PROJECTION_RESTORATION_RESULT_PATH, result);
    return result;
  } finally {
    await connection.end();
  }
}

export async function readArmorProjectionRows(connection, _proposal = null, { forUpdate = false } = {}) {
  const rows = await readRows(connection,
    `SELECT ${TARGET_COLUMNS.map((column) => MYSQL_DATETIME_COLUMNS.has(column)
      ? `DATE_FORMAT(\`${column}\`, '%Y-%m-%d %H:%i:%s') AS \`${column}\``
      : `\`${column}\``).join(', ')} `
      + 'FROM terria_v1_relation.projection_armor_sets '
      + `ORDER BY text_key${forUpdate ? ' FOR UPDATE' : ''}`);
  return normalizeArmorRows(rows);
}

export async function readCurrentArmorSourceSnapshotHash(connection, _proposal = null, { forUpdate = false } = {}) {
  return hashJson(await readArmorSourceRows(connection, { forUpdate }));
}

export async function insertArmorProjectionRows(connection, rows) {
  const sql = `INSERT INTO terria_v1_relation.projection_armor_sets `
    + `(${TARGET_COLUMNS.map((column) => `\`${column}\``).join(', ')}) `
    + `VALUES (${TARGET_COLUMNS.map(() => '?').join(', ')})`;
  let affected = 0;
  for (const row of normalizeArmorRows(rows)) {
    const [result] = await connection.execute(sql, TARGET_COLUMNS.map((column) => (
      MYSQL_DATETIME_COLUMNS.has(column)
        ? toMysqlDateTime(row[toCamel(column)])
        : row[toCamel(column)]
    )));
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

const MYSQL_DATETIME_COLUMNS = new Set([
  'source_revision_timestamp',
  'created_at',
  'updated_at',
]);

export function toMysqlDateTime(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error('Armor projection restoration timestamp is invalid');
  const iso = date.toISOString();
  return iso.slice(0, 19).replace('T', ' ');
}

async function readArmorSourceRows(connection, { forUpdate = false } = {}) {
  const result = {};
  for (const [key, table] of Object.entries(SOURCE_TABLES)) {
    const lock = forUpdate ? ' FOR SHARE' : '';
    result[key] = await readRows(connection, `SELECT * FROM ${quoteTable(table)} WHERE status=1 AND deleted=0 ORDER BY id${lock}`);
  }
  return result;
}

function buildInput(proposal, proposalSha256) {
  return {
    schemaVersion: 1,
    operationId: ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    proposalPath: ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH,
    proposalSha256,
    scopeSha256: proposal.scopeSha256,
    sourceSnapshotSha256: proposal.source.sourceSnapshotSha256,
    keySetSha256: proposal.keySetSha256,
    beforeRowsSha256: proposal.before.rowsSha256,
    afterRowsSha256: proposal.after.rowsSha256,
    expectedChangedRowCount: proposal.changedRowCount,
    writeTargets: [...WRITE_TARGETS],
  };
}

function validateInput(input, proposal, proposalSha256) {
  validateArmorSetProjectionRestorationProposal(proposal);
  if (input?.schemaVersion !== 1 || input.operationId !== ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID
      || input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false
      || input.proposalPath !== ARMOR_SET_PROJECTION_RESTORATION_PROPOSAL_PATH
      || input.proposalSha256 !== proposalSha256 || input.scopeSha256 !== proposal.scopeSha256
      || input.sourceSnapshotSha256 !== proposal.source.sourceSnapshotSha256
      || input.keySetSha256 !== proposal.keySetSha256
      || input.beforeRowsSha256 !== proposal.before.rowsSha256
      || input.afterRowsSha256 !== proposal.after.rowsSha256
      || input.expectedChangedRowCount !== proposal.changedRowCount
      || stableString(input.writeTargets) !== stableString(WRITE_TARGETS)) {
    throw new Error('Armor projection restoration input binding drifted');
  }
}

export function normalizeArmorRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((raw) => {
    const row = toCamelRow(raw);
    return Object.fromEntries(ARMOR_ROW_FIELDS.map((field) => [field, normalizeFieldValue(field, row[field])]));
  }).sort((left, right) => String(left.textKey).localeCompare(String(right.textKey)));
}

function normalizeFieldValue(field, value) {
  if (field === 'sourceRevisionTimestamp' || field === 'createdAt' || field === 'updatedAt') {
    if (value == null || value === '') return null;
    const text = value instanceof Date ? value.toISOString() : String(value);
    const date = value instanceof Date
      ? value
      : new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
    if (!Number.isFinite(date.valueOf())) throw new Error(`Armor projection restoration timestamp is invalid: ${field}`);
    return date.toISOString();
  }
  return value ?? null;
}

function validateSourceCounts(sourceCounts, expectedCount) {
  if (!Number.isInteger(Number(sourceCounts?.relationArmorSets))
      || Number(sourceCounts.relationArmorSets) !== expectedCount) {
    throw new Error('Armor projection restoration relation set count drifted');
  }
  if (expectedCount === ARMOR_SET_PROJECTION_RESTORATION_EXPECTED_COUNT) {
    for (const [key, expected] of Object.entries(EXPECTED_SOURCE_COUNTS)) {
      if (Number(sourceCounts?.[key]) !== expected) {
        throw new Error(`Armor projection restoration ${key} count drifted: expected ${expected}`);
      }
    }
  }
}

function assertUniqueArmorKeys(rows) {
  const ids = new Set();
  const keys = new Set();
  for (const row of rows) {
    if (!Number.isInteger(Number(row.id)) || Number(row.id) <= 0
        || !row.textKey || !/^[a-f0-9]{64}$/.test(String(row.relationRecordKey ?? ''))
        || ids.has(Number(row.id)) || keys.has(row.textKey)) {
      throw new Error('Armor projection restoration row key is invalid or duplicated');
    }
    ids.add(Number(row.id));
    keys.add(row.textKey);
  }
}

function computeScopeHash(proposal) {
  return hashJson({
    operationId: proposal.operationId,
    authorityKind: proposal.authorityKind,
    serverFingerprint: proposal.serverFingerprint,
    source: proposal.source,
    target: proposal.target,
    columns: proposal.columns,
    expectedRowCount: proposal.expectedRowCount,
    changedRowCount: proposal.changedRowCount,
    keySetSha256: proposal.keySetSha256,
    before: proposal.before,
    after: proposal.after,
  });
}

function toCamelRow(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [toCamel(key), value]));
}

function toCamel(key) {
  return String(key).replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function quoteTable(table) {
  return table.split('.').map((part) => `\`${part}\``).join('.');
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableString(value) {
  return JSON.stringify(stableValue(value));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(stableString(value)).digest('hex')}`;
}

function hashFile(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function isHash(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

function isUuid(value) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value ?? ''));
}

async function readRows(connection, sql, values = []) {
  const [rows] = await connection.query(sql, values);
  return Array.isArray(rows) ? rows : [];
}

async function readCurrentAutomationPolicyRows(connection) {
  const rows = await readRows(connection,
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, '
      + 'pv.policy_hash AS policyHash FROM terria_v1_local.crawler_automation_policy p '
      + 'JOIN terria_v1_local.crawler_automation_policy_version pv ON pv.domain_id=p.domain_id '
      + 'AND pv.policy_version=p.current_version ORDER BY p.domain_id');
  const canonical = canonicalizePolicySet(rows);
  if (canonical.length === 0) throw new Error('Armor projection restoration automation policy rows are missing');
  return canonical;
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

function readJson(repoRoot, relativePath) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Armor projection restoration artifact',
  });
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writePrivateJson(repoRoot, relativePath, value) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Armor projection restoration artifact',
    createParent: true,
  });
  if (fs.existsSync(target)) throw new Error(`Armor projection restoration artifact already exists: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function assertFresh(repoRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    if (fs.existsSync(path.resolve(repoRoot, relativePath))) {
      throw new Error(`Armor projection restoration output already exists: ${relativePath}`);
    }
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((token) => {
    const [key, ...rest] = String(token).replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args['operation-id'] && args['operation-id'] !== ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID) {
    throw new Error(`unsupported Armor projection restoration operation: ${args['operation-id']}`);
  }
  const action = args.apply === 'true'
    ? applyArmorSetProjectionRestoration()
    : args['prepare-authorization'] === 'true'
      ? prepareArmorSetProjectionRestorationAuthorization()
      : prepareArmorSetProjectionRestorationProposal();
  action.then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}
