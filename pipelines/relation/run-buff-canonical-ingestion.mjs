#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  applyBuffCanonicalMutation,
  executeBuffCanonicalTransaction,
  BUFF_CANONICAL_TRANSACTION_TABLES,
} from './buff-canonical-transaction-executor.mjs';

export const BUFF_CANONICAL_OPERATION_ID = 'canonical-buff-full-chain';
const repoRoot = getProjectRoot();
const DATABASE = 'terria_v1_relation';
const TABLES = [...BUFF_CANONICAL_TRANSACTION_TABLES];

export function parseBuffCanonicalIngestionArgs(argv = []) {
  const args = {};
  for (const token of argv) {
    const match = /^--(operation-id|result-label|apply)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Buff canonical ingestion CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== BUFF_CANONICAL_OPERATION_ID) {
    throw new Error('Buff canonical ingestion CLI requires the exact operation id');
  }
  if (typeof args['result-label'] !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args['result-label'])) {
    throw new Error('Buff canonical ingestion CLI requires a normalized result label');
  }
  if (args.apply !== 'true') throw new Error('Buff canonical ingestion CLI requires --apply=true');
  return { operationId: args['operation-id'], resultLabel: args['result-label'], apply: true };
}

export function buildBuffCanonicalIngestionPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Buff canonical ingestion result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${BUFF_CANONICAL_OPERATION_ID}.${resultLabel}`;
  return {
    envelopePath: `${prefix}.envelope.json`,
    resultPath: `${prefix}.result.json`,
  };
}

export async function applyBuffCanonicalIngestion({
  repoRoot: suppliedRepoRoot = repoRoot,
  resultLabel,
  env = process.env,
  mysqlModule,
  loadContext = loadAuthorizedOperationContext,
  readEnvelope = readPrivateJson,
  connection: suppliedConnection = null,
  consumePermit = consumeAuthorizedOperationDispatchPermit,
} = {}) {
  const root = path.resolve(suppliedRepoRoot);
  const paths = buildBuffCanonicalIngestionPaths(resultLabel);
  const context = loadContext({ repoRoot: root, operationId: BUFF_CANONICAL_OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const binding = context.executionManifest?.buffFullChain;
  if (!binding || binding.envelopePath !== paths.envelopePath || binding.resultPath !== paths.resultPath) {
    throw new Error('Buff canonical ingestion packet path binding drifted');
  }
  const envelopeBinding = (context.dataBundleEntries ?? []).find((entry) => entry.path === paths.envelopePath);
  if (!envelopeBinding?.contentHash) throw new Error('Buff canonical ingestion envelope binding is missing');
  const envelope = readEnvelope(root, paths.envelopePath, envelopeBinding.contentHash);
  if (envelope?.schemaVersion !== 'buff-full-chain-execution/v1' || envelope.executable !== true) {
    throw new Error('Buff canonical ingestion envelope is not executable');
  }
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  if (!['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host) || Number(fingerprint.port) !== 13306) {
    throw new Error('Buff canonical ingestion target must be the loopback local stack');
  }
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connection = suppliedConnection ?? await mysql.createConnection({
    host: fingerprint.host,
    port: fingerprint.port,
    user: env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: 'terria_v1_local',
    dateStrings: true,
  });
  const bindingPacket = binding.packet ?? {};
  const packet = {
    runId: bindingPacket.runId ?? context.runId,
    fenceToken: bindingPacket.fenceToken ?? context.fenceToken,
    serverUuid: fingerprint.serverUuid,
    actor: bindingPacket.actor ?? context.actor ?? 'canonical-buff-full-chain',
  };
  let committed = false;
  try {
    const result = await executeBuffCanonicalTransaction({
      envelope,
      packet,
      connection,
      lockRuntime: async () => lockRuntime(connection, packet, envelope),
      readLockedRows: async () => {
        const rows = await readOwnedRows(connection);
        assertBuffLockedRowsMatchEnvelope({ envelope, rows });
        return rows;
      },
      consumeDispatchPermit: () => consumePermit({
        env,
        authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
      applyMutation: async () => applyBuffCanonicalMutation({ envelope, connection }),
      verifyAfter: async () => verifyOwnedRows(connection, envelope),
    });
    committed = result.status === 'completed';
    writePrivateJson(root, paths.resultPath, { operationId: BUFF_CANONICAL_OPERATION_ID, status: result.status, packet });
    return result;
  } finally {
    if (!suppliedConnection && connection && typeof connection.end === 'function') await connection.end();
    if (!committed) {
      // The transaction executor owns rollback; this branch only preserves the
      // absence of a completed result when a pre-commit guard rejects.
    }
  }
}

async function lockRuntime(connection, packet, envelope) {
  const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS serverPort');
  if (servers?.length !== 1 || String(servers[0].serverUuid) !== packet.serverUuid) {
    throw new Error('Buff canonical ingestion server identity drifted');
  }
  const [owners] = await connection.query(
    'SELECT username, status FROM terria_v1_local.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE',
  );
  if (owners?.length !== 1 || owners[0].status !== 'ACTIVE' || owners[0].username !== packet.actor) {
    throw new Error('Buff canonical ingestion owner is not active or actor drifted');
  }
  const [fences] = await connection.query(
    'SELECT latest_run_id, fence_token, (expires_at > CURRENT_TIMESTAMP) AS active FROM terria_v1_local.crawler_automation_write_fence FOR UPDATE',
  );
  const active = (fences ?? []).filter((row) => Number(row.active) === 1);
  if (active.length !== 1 || active[0].latest_run_id !== packet.runId || active[0].fence_token !== packet.fenceToken) {
    throw new Error('Buff canonical ingestion ownership fence is missing, foreign or expired');
  }
  const landingIds = (envelope.frozenLandingIdentity?.rows ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
  const maintIds = (envelope.frozenMaintIdentity?.rows ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
  if (landingIds.length === 0 || maintIds.length === 0) throw new Error('Buff canonical ingestion frozen source identities are missing');
  const [landingRows] = await connection.query(
    `SELECT * FROM terria_v1_local.source_dataset_landings WHERE id IN (${landingIds.map(() => '?').join(',')}) FOR UPDATE`,
    landingIds,
  );
  const [maintRows] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_buffs WHERE id IN (${maintIds.map(() => '?').join(',')}) FOR UPDATE`,
    maintIds,
  );
  assertBuffSourceRowsMatchEnvelope({ envelope, landingRows, maintRows });
}

async function readOwnedRows(connection) {
  const rows = {};
  for (const table of TABLES) {
    const [result] = await connection.query(
      `SELECT * FROM ${quote(DATABASE)}.${quote(table)} WHERE deleted = 0 ORDER BY id`,
    );
    rows[table] = result ?? [];
  }
  return rows;
}

async function verifyOwnedRows(connection, envelope) {
  const current = await readOwnedRows(connection);
  for (const table of TABLES) {
    const byKey = new Map((current[table] ?? []).map((row) => [String(table === 'projection_buffs' ? row.id : row.record_key), row]));
    for (const row of envelope.mutation.expectedRows?.[table] ?? []) {
      const key = String(table === 'projection_buffs' ? row.id : row.record_key);
      const actual = byKey.get(key);
      if (!actual) throw new Error(`Buff canonical ingestion readback row is missing: ${table}/${key}`);
      for (const [column, expected] of Object.entries(row)) {
        if (['created_at', 'updated_at'].includes(column)) continue;
        if (String(actual[column] ?? '') !== String(expected ?? '')) {
          throw new Error(`Buff canonical ingestion readback drifted: ${table}.${column}`);
        }
      }
    }
  }
}

export function assertBuffLockedRowsMatchEnvelope({ envelope, rows } = {}) {
  const changes = envelope?.mutation?.changes;
  if (!changes || !rows || typeof rows !== 'object') throw new Error('Buff locked rederivation input is required');
  for (const table of TABLES) {
    const actualRows = Array.isArray(rows[table]) ? rows[table] : [];
    const byKey = new Map(actualRows.map((row) => [rowIdentity(table, row), row]));
    const tableChanges = changes[table];
    for (const change of [...(tableChanges.updates ?? [])]) {
      const key = rowIdentity(table, change.before);
      const actual = byKey.get(key);
      if (!actual) throw new Error(`Buff locked rederivation row is missing: ${table}/${key}`);
      assertComparableRow(change.before, actual, table, key);
    }
    for (const expected of [...(tableChanges.unchanged ?? []), ...(tableChanges.preserved ?? [])]) {
      const key = rowIdentity(table, expected);
      const actual = byKey.get(key);
      if (!actual) throw new Error(`Buff locked rederivation row is missing: ${table}/${key}`);
      assertComparableRow(expected, actual, table, key);
    }
    for (const inserted of tableChanges.inserts ?? []) {
      const key = rowIdentity(table, inserted);
      if (key !== null && byKey.has(key)) throw new Error(`Buff locked rederivation insert identity already exists: ${table}/${key}`);
    }
  }
  return true;
}

export function assertBuffSourceRowsMatchEnvelope({ envelope, landingRows, maintRows } = {}) {
  const expectedLanding = envelope?.frozenLandingIdentity?.rows;
  const expectedMaint = envelope?.frozenMaintIdentity?.rows;
  if (!Array.isArray(expectedLanding) || !Array.isArray(expectedMaint)) {
    throw new Error('Buff frozen source identity rows are required');
  }
  assertBuffRowSet(expectedLanding, landingRows, 'landing');
  assertBuffRowSet(expectedMaint, maintRows, 'maint');
  return true;
}

function assertBuffRowSet(expectedRows, actualRows, label) {
  if (!Array.isArray(actualRows) || actualRows.length !== expectedRows.length) {
    throw new Error(`Buff locked ${label} identity row count drifted`);
  }
  const sortedExpected = [...expectedRows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const sortedActual = [...actualRows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  for (let index = 0; index < sortedExpected.length; index += 1) {
    assertComparableRow(sortedExpected[index], sortedActual[index], label, String(index));
  }
}

function rowIdentity(table, row) {
  if (!row || typeof row !== 'object') return null;
  if (table === 'projection_buffs') {
    if (row.id != null) return `id:${String(row.id)}`;
    if (row.relation_record_key != null) return `relation:${String(row.relation_record_key)}`;
    if (row.internal_name != null || row.source_id != null) return `source:${String(row.source_id)}:${String(row.internal_name)}`;
    return null;
  }
  return row.record_key == null ? null : `record:${String(row.record_key)}`;
}

function assertComparableRow(expected, actual, table, key) {
  for (const [column, value] of Object.entries(expected ?? {})) {
    if (column === 'created_at' || column === 'updated_at') continue;
    if (!equalBuffValue(actual?.[column], value)) {
      throw new Error(`Buff locked rederivation drifted: ${table}.${column}/${key}`);
    }
  }
}

function equalBuffValue(left, right) {
  if (left == null || right == null) return left == null && right == null;
  if (typeof left === 'number' || typeof right === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(left)) && /^-?\d+(?:\.\d+)?$/.test(String(right))) {
    const leftNumber = Number(left); const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  }
  if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime();
  return String(left) === String(right);
}

function readPrivateJson(root, relativePath, expectedHash = null) {
  const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Buff canonical ingestion envelope' });
  if ((fs.statSync(target).mode & 0o077) !== 0) throw new Error('Buff canonical ingestion envelope must be private');
  const bytes = fs.readFileSync(target);
  if (expectedHash != null) {
    // The execution manifest binds the exact envelope bytes through the normal
    // data-bundle hash; an optional per-file hash is an additional guard.
    const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (actual !== expectedHash) throw new Error('Buff canonical ingestion envelope hash drifted');
  }
  return JSON.parse(bytes.toString('utf8'));
}

function writePrivateJson(root, relativePath, value) {
  const target = assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Buff canonical ingestion result', createParent: true });
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function quote(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`invalid SQL identifier: ${value ?? ''}`);
  return `\`${value}\``;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseBuffCanonicalIngestionArgs(process.argv.slice(2));
    applyBuffCanonicalIngestion({ resultLabel: args.resultLabel })
      .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
