import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertAutomationRedisLogicalDb,
  assertAutomationRedisDomainLogicalDb,
  AUTOMATION_REDIS_LOGICAL_DB_MAX,
  FORMAL_DATABASES,
} from './automation-database-contract.mjs';
import { TABLE_OWNERSHIP_MATRIX } from './table-ownership-matrix.mjs';
import { buildMaintSchemaSql } from '../maint/maint-schema.mjs';
import { buildProjectionSchemaStatements } from '../relation/projection-schema.mjs';
import { buildRelationSchemaStatements } from '../relation/relation-schema.mjs';
import {
  dependencyManifestSha256,
  seedExactDependencies,
  validateDependencyManifest,
} from './eight-domain-dependency-seeder.mjs';

const IDENTIFIER = /^[a-z0-9_]+$/;
const FORMAL_REFERENCE = /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i;
const SENSITIVE_COLUMN = /(?:password|passwd|secret|token|email|phone|credential|session|cookie)/i;
const TEMPORARY_MYSQL_ACCOUNT_HOST = '127.0.0.1';
const OWNED_REDIS_KEY_PREFIXES = Object.freeze([
  'terrapedia:crawler:wiki-monitor:v2:',
  'terrapedia:crawler:wiki-monitor:dispatch-queue:',
  'terrapedia:crawler:backend-refresh:',
  'terrapedia:crawler:item-pages-refresh:',
  'terrapedia:crawler:buff-page-immunity-refresh:',
  'item:public:list:',
  'item:public:detail:',
  'item:public:suggestions:',
  'item:detail:',
  'item:list:',
  'item:suggestions:',
  'item:aggregate:',
  'home:focus-item:',
  'security:http-rate:',
  'security:admin-login:',
  'security:login:',
  'security:admin-job-lock:'
]);
const AUTOMATION_REDIS_RESERVATION_KEY = 'terrapedia:automation:reservation';
const PRE_CUTOVER_CANONICAL_TABLES = new Set([
  'local.item_groups',
  'local.item_group_members',
  'local.item_group_aliases',
  'local.item_group_admin_audit',
  'local.item_group_projection_state',
  'maint.maint_item_groups',
  'maint.maint_item_group_members',
  'maint.maint_item_group_aliases',
  'maint.maint_item_group_member_exclusions',
  'relation.relation_item_groups',
  'relation.relation_item_group_members',
  'relation.relation_item_group_aliases',
]);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireIdentifier(value, label) {
  const text = String(value ?? '');
  if (!IDENTIFIER.test(text)) throw new Error(`${label} is not a safe identifier`);
  return text;
}

export function defaultExecute({ command, args, stdin, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.once('error', fail);
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') fail(error);
    });
    child.once('close', (exitCode) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, exitCode });
    });
    child.stdin.end(stdin);
  });
}

export function createMysqlCommandClient({
  host,
  port,
  username,
  password,
  database,
  execute = defaultExecute
} = {}) {
  if (host !== '127.0.0.1') throw new Error('automation MySQL host must be 127.0.0.1');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('automation MySQL port is invalid');
  const user = String(username ?? '').trim();
  if (!user || /[\x00-\x1f\x7f]/.test(user)) throw new Error('automation MySQL username is invalid');
  if (!String(password ?? '')) throw new Error('automation MySQL password is required');
  if (database !== undefined) requireIdentifier(database, 'database');

  return Object.freeze({
    async query(sql, targetDatabase = database) {
      const statement = String(sql ?? '');
      if (!statement.trim()) throw new Error('SQL stdin is required');
      const args = [
        '--protocol=TCP', '--batch', '--raw', '--skip-column-names',
        '--host', host, '--port', String(port), '--user', user
      ];
      if (targetDatabase) args.push('--database', requireIdentifier(targetDatabase, 'database'));
      const result = await execute({
        command: 'mysql',
        args,
        stdin: statement,
        env: { MYSQL_PWD: String(password) }
      });
      if (result.exitCode !== 0) {
        throw new Error(`mysql command failed: ${String(result.stderr ?? '').trim() || `exit ${result.exitCode}`}`);
      }
      return result.stdout;
    }
  });
}

export function rewriteSchemaForIsolatedDatabase({ sql, replacements = {}, targetDatabase } = {}) {
  requireIdentifier(targetDatabase, 'target database');
  let rewritten = String(sql ?? '');
  for (const [source, target] of Object.entries(replacements)) {
    if (!Object.values(FORMAL_DATABASES).includes(source)) {
      throw new Error(`schema replacement source is not a formal database: ${source}`);
    }
    requireIdentifier(target, 'schema replacement target');
    rewritten = rewritten.replaceAll(source, target);
  }
  if (FORMAL_REFERENCE.test(rewritten)) {
    throw new Error('rewritten schema contains a formal database reference');
  }
  return rewritten;
}

export function rewriteFrozenCreateTable({ sourceSql, table, targetDatabase } = {}) {
  const safeTable = requireIdentifier(table, 'frozen schema table');
  requireIdentifier(targetDatabase, 'frozen schema target database');
  const statement = String(sourceSql ?? '').trim().replace(/;\s*$/, '');
  const identity = new RegExp(`^CREATE\\s+TABLE\\s+\\\`${safeTable}\\\`\\s*\\(`, 'i');
  if (!identity.test(statement)) throw new Error('frozen schema table identity mismatch');
  if (/\bAS\s+SELECT\b/i.test(statement) || /;/.test(statement)) {
    throw new Error('frozen schema contains unsafe multi-statement or SELECT DDL');
  }
  return rewriteSchemaForIsolatedDatabase({ sql: statement, replacements: {}, targetDatabase });
}

export function requiresBootstrapMigrationSession(sql) {
  const statement = String(sql ?? '');
  if (/\bSET\s+GLOBAL\b|log_bin_trust_function_creators/i.test(statement)) {
    throw new Error('global MySQL configuration changes are forbidden in automation acceptance');
  }
  return /\bCREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?TRIGGER\b/i.test(statement);
}

/**
 * The mysql CLI treats every semicolon as a statement boundary unless its
 * client-side delimiter is changed. Migration files are consumed by Flyway in
 * production, but the isolated acceptance adapter feeds them to the CLI, so
 * compound trigger bodies need an equivalent delimiter wrapper.
 */
export function rewriteMysqlCliCompoundTriggerDelimiters(sql) {
  const source = String(sql ?? '');
  const lines = source.split(/\r?\n/);
  if (!/\bCREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?TRIGGER\b/i.test(source)
      || !lines.some((line) => /^\s*BEGIN\s*$/i.test(line))) {
    return source;
  }
  if (/^\s*DELIMITER\b/im.test(source)) {
    throw new Error('compound trigger migration already contains a mysql CLI delimiter directive');
  }

  const output = [];
  let transformed = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*CREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?TRIGGER\b/i.test(line)) {
      let beginIndex = -1;
      for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
        if (/^\s*(?:CREATE|DROP|ALTER)\s+\w+/i.test(lines[candidate])) break;
        if (/^\s*BEGIN\s*$/i.test(lines[candidate])) {
          beginIndex = candidate;
          break;
        }
      }
      if (beginIndex >= 0) {
        let endIndex = -1;
        for (let candidate = beginIndex + 1; candidate < lines.length; candidate += 1) {
          if (/^\s*END;\s*$/i.test(lines[candidate])) {
            endIndex = candidate;
            break;
          }
        }
        if (endIndex < 0) throw new Error('compound trigger migration is missing its terminal END statement');
        output.push('DELIMITER $$');
        output.push(...lines.slice(index, endIndex));
        output.push(lines[endIndex].replace(/;\s*$/, () => '$$'));
        output.push('DELIMITER ;');
        index = endIndex;
        transformed = true;
        continue;
      }
    }
    output.push(line);
  }
  return transformed ? output.join('\n') : source;
}

export function buildBoundedSnapshotPlan({ maxRowsPerTable = 2 } = {}) {
  if (!Number.isInteger(maxRowsPerTable) || maxRowsPerTable < 1 || maxRowsPerTable > 25) {
    throw new Error('snapshot row cap must be between 1 and 25');
  }
  const unique = new Map();
  for (const entry of TABLE_OWNERSHIP_MATRIX) {
    const role = String(entry.databaseRole ?? '');
    const table = requireIdentifier(entry.table, 'snapshot table');
    if (!['local', 'maint', 'relation'].includes(role)) {
      throw new Error(`snapshot role is unsupported: ${role}`);
    }
    unique.set(`${role}.${table}`, Object.freeze({ role, table, maxRows: maxRowsPerTable }));
  }
  return Object.freeze([...unique.values()].sort((left, right) => (
    left.role.localeCompare(right.role) || left.table.localeCompare(right.table)
  )));
}

export function buildUnavailableSourceSnapshotEntry({ role, table, maxRows } = {}) {
  const safeRole = String(role ?? '');
  const safeTable = requireIdentifier(table, 'snapshot table');
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 25) {
    throw new Error('snapshot row cap must be between 1 and 25');
  }
  if (!PRE_CUTOVER_CANONICAL_TABLES.has(`${safeRole}.${safeTable}`)) {
    throw new Error(`${safeRole}.${safeTable} is not an allowed pre-cutover canonical table`);
  }
  return Object.freeze({
    role: safeRole,
    table: safeTable,
    maxRows,
    sourceCount: 0,
    sourceAvailable: false,
    sampleHash: null,
    schemaHash: null,
  });
}

export function buildSnapshotRowSelect({ table, columns, maxRows } = {}) {
  requireIdentifier(table, 'snapshot table');
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 25) throw new Error('snapshot row cap is invalid');
  const safeColumns = (columns ?? [])
    .map((column) => requireIdentifier(column, 'snapshot column'))
    .filter((column) => !SENSITIVE_COLUMN.test(column));
  if (!safeColumns.length) throw new Error('snapshot has no non-sensitive source columns');
  const pairs = safeColumns.flatMap((column) => [
    `'${column}'`, `CAST(\`${column}\` AS CHAR CHARACTER SET utf8mb4)`
  ]);
  return `SELECT JSON_OBJECT(${pairs.join(', ')}) FROM \`${table}\` LIMIT ${maxRows}`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  const escaped = String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\0', '\\0')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll("'", "\\'");
  return `'${escaped}'`;
}

function commonSnapshotColumns(row, targetColumns) {
  const target = new Set((targetColumns ?? []).map((column) => requireIdentifier(column, 'snapshot target column')));
  return Object.keys(row ?? {})
    .filter((column) => target.has(column) && !SENSITIVE_COLUMN.test(column))
    .sort((left, right) => left.localeCompare(right));
}

export function buildSnapshotTargetRow({ role, table, row, targetColumns } = {}) {
  const sourceRow = { ...(row ?? {}) };
  const target = new Set((targetColumns ?? []).map((column) => (
    requireIdentifier(column, 'snapshot target column')
  )));
  if (role !== 'local' || table !== 'source_dataset_landings' || !target.has('artifact_role')) {
    return sourceRow;
  }
  const required = ['artifact_role', 'producer_id', 'producer_version', 'producer_run_key', 'source_page'];
  if (required.every((column) => sourceRow[column] !== null && sourceRow[column] !== undefined)) {
    return sourceRow;
  }
  return {
    ...sourceRow,
    artifact_role: 'legacy_compat',
    producer_id: 'legacy.source-dataset-importer',
    producer_version: 'pre-v56',
    producer_run_key: `legacy-${sourceRow.id}`,
    source_page: sourceRow.source_page ?? sourceRow.source_key,
  };
}

export function buildSnapshotInsertSql({ table, row, targetColumns } = {}) {
  requireIdentifier(table, 'snapshot target table');
  const common = commonSnapshotColumns(row, targetColumns);
  if (!common.length) throw new Error(`snapshot has no safe common columns for ${table}`);
  return `INSERT INTO \`${table}\` (${common.map((column) => `\`${column}\``).join(', ')}) VALUES (`
    + `${common.map((column) => sqlValue(row[column])).join(', ')}) ON DUPLICATE KEY UPDATE `
    + common.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
}

export function buildSnapshotRowMatchSql({ table, row, targetColumns } = {}) {
  requireIdentifier(table, 'snapshot verification table');
  const common = commonSnapshotColumns(row, targetColumns);
  if (!common.length) throw new Error(`snapshot has no safe verification columns for ${table}`);
  return `SELECT COUNT(*) FROM \`${table}\` WHERE `
    + common.map((column) => `\`${column}\` <=> ${sqlValue(row[column])}`).join(' AND ');
}

function normalizedGrant(grant) {
  return String(grant ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function validateTemporaryAccountGrants({ provisionerGrants, readonlyGrants, databases } = {}) {
  const expectedTargets = new Set(Object.values(databases ?? {}).map((name) => requireIdentifier(name, 'isolated database')));
  if (expectedTargets.size !== 3) throw new Error('exactly three isolated databases are required for grant validation');

  const provisioner = (provisionerGrants ?? []).map(normalizedGrant)
    .filter((grant) => grant && !/^grant usage on \*\.\*/.test(grant));
  assertLoopbackGrantTargets(provisioner, 'provisioner');
  if (provisioner.some((grant) => / on \*\.\*/.test(grant))) {
    throw new Error('provisioner global grants are forbidden');
  }
  for (const target of expectedTargets) {
    if (!provisioner.some((grant) => grant.includes(`on \`${target}\`.*`))) {
      throw new Error(`provisioner grant is missing for ${target}`);
    }
  }
  if (provisioner.some((grant) => {
    const match = grant.match(/ on `?([a-z0-9_]+)`?\.\*/);
    return !match || !expectedTargets.has(match[1]);
  })) {
    throw new Error('provisioner grant exceeds the exact isolated database set');
  }

  const expectedFormal = new Set(Object.values(FORMAL_DATABASES));
  const readonly = (readonlyGrants ?? []).map(normalizedGrant)
    .filter((grant) => grant && !/^grant usage on \*\.\*/.test(grant));
  assertLoopbackGrantTargets(readonly, 'formal read-only');
  if (readonly.length !== expectedFormal.size) throw new Error('formal read-only grant set is incomplete');
  for (const target of expectedFormal) {
    const grant = readonly.find((candidate) => candidate.includes(`on \`${target}\`.*`));
    if (!grant || !/^grant (select, show view|show view, select) on /.test(grant)) {
      throw new Error(`formal grant is not read-only for ${target}`);
    }
  }
  if (readonly.some((grant) => /\b(insert|update|delete|create|drop|alter|truncate|all privileges)\b/.test(grant))) {
    throw new Error('read-only account contains a write grant');
  }
  return true;
}

function assertLoopbackGrantTargets(grants, label) {
  for (const grant of grants) {
    if (!/@(?:`127\.0\.0\.1`|'127\.0\.0\.1')$/.test(grant)) {
      throw new Error(`${label} account grants must target the loopback MySQL host`);
    }
  }
}

const ISOLATED_API_DATABASE_ROLES = Object.freeze(['local', 'maint', 'relation']);
const ISOLATED_API_DOMAINS = Object.freeze(['items', 'npcs', 'projectiles', 'audio', 'bosses', 'armor_sets', 'buffs', 'shimmer']);
const ISOLATED_API_READONLY_PRIVILEGES = 'select, show view';
const ISOLATED_API_V2_READ_PRIVILEGES = 'select, show view';
const ISOLATED_API_V2_TABLE_PRIVILEGES = 'insert, update, delete';

function validateIsolatedApiDatabaseSet(databases) {
  if (!databases || typeof databases !== 'object' || Array.isArray(databases)
      || Object.keys(databases).sort().join(',') !== [...ISOLATED_API_DATABASE_ROLES].sort().join(',')) {
    throw new Error('isolated API account requires exactly local, maint, and relation databases');
  }
  const values = ISOLATED_API_DATABASE_ROLES.map((role) => requireIdentifier(databases[role], `${role} isolated API database`));
  if (values.some((name) => Object.values(FORMAL_DATABASES).includes(name))) {
    throw new Error('formal databases are forbidden for isolated API accounts');
  }
  const prefix = values[0].replace(/_local$/, '');
  if (!values[0].endsWith('_local') || databases.maint !== `${prefix}_maint`
      || databases.relation !== `${prefix}_relation`
      || !/^terria_v1_automation_acceptance_[a-z0-9_]+$/.test(prefix)) {
    throw new Error('isolated API schemas must be one exact run-derived T1 database set');
  }
  return Object.freeze(Object.fromEntries(ISOLATED_API_DATABASE_ROLES.map((role) => [role, databases[role]])));
}

function validateIsolatedApiAccountNames(accountNames) {
  const values = requireObject(accountNames, 'isolated API account names');
  const apiReadonly = requireIdentifier(values.apiReadonly, 'apiReadonly account');
  const apiV2Test = requireIdentifier(values.apiV2Test, 'apiV2Test account');
  if (apiReadonly === apiV2Test) throw new Error('isolated API account names must be distinct');
  return Object.freeze({ apiReadonly, apiV2Test });
}

function requireIsolatedApiDomain(domain) {
  if (!ISOLATED_API_DOMAINS.includes(domain)) throw new Error(`unsupported isolated API domain: ${String(domain)}`);
  return domain;
}

function apiGrantSignature(grant) {
  const normalized = normalizedGrant(grant);
  const match = normalized.match(/^grant (.+?) on `?([a-z0-9_]+)`?\.(?:`?([a-z0-9_]+)`?|\*)/);
  if (!match) return null;
  const hostMatch = normalized.match(/@(?:`([^`]+)`|'([^']+)')$/);
  return { privileges: match[1], database: match[2], table: match[3] ?? null, host: hostMatch?.[1] ?? hostMatch?.[2] ?? null };
}

function nonUsageGrants(grants) {
  return (grants ?? []).map(normalizedGrant).filter((grant) => grant && !/^grant usage on \*\.\*/.test(grant));
}

export function buildIsolatedApiAccountGrants({ domain, databases, accountNames } = {}) {
  const targetDomain = requireIsolatedApiDomain(domain);
  const targetDatabases = validateIsolatedApiDatabaseSet(databases);
  const targets = validateIsolatedApiAccountNames(accountNames);
  const grants = [
    ...ISOLATED_API_DATABASE_ROLES.map((role) => Object.freeze({
      role: 'apiReadonly',
      database: targetDatabases[role],
      table: null,
      privileges: Object.freeze(['SELECT', 'SHOW VIEW']),
      sql: `GRANT SELECT, SHOW VIEW ON \`${targetDatabases[role]}\`.* TO ${sqlString(targets.apiReadonly)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}'`,
    })),
    ...ISOLATED_API_DATABASE_ROLES.map((role) => Object.freeze({
      role: 'apiV2Test',
      database: targetDatabases[role],
      table: null,
      privileges: Object.freeze(['SELECT', 'SHOW VIEW']),
      sql: `GRANT SELECT, SHOW VIEW ON \`${targetDatabases[role]}\`.* TO ${sqlString(targets.apiV2Test)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}'`,
    })),
  ];
  const writableTables = new Set(TABLE_OWNERSHIP_MATRIX
    .filter((entry) => entry.capability === targetDomain && entry.writeMode === 'write')
    .map((entry) => `${entry.databaseRole}.${entry.table}`));
  if (writableTables.size === 0) throw new Error(`isolated API domain ${targetDomain} has no registered writable tables`);
  writableTables.add('local.crawler_automation_alert');
  for (const qualifiedTable of [...writableTables].sort()) {
    const [databaseRole, table] = qualifiedTable.split('.');
    if (!ISOLATED_API_DATABASE_ROLES.includes(databaseRole)) throw new Error('isolated API write table has an unknown database role');
    requireIdentifier(table, 'isolated API writable table');
    grants.push(Object.freeze({
      role: 'apiV2Test',
      database: targetDatabases[databaseRole],
      table,
      privileges: Object.freeze(['INSERT', 'UPDATE', 'DELETE']),
      sql: `GRANT INSERT, UPDATE, DELETE ON \`${targetDatabases[databaseRole]}\`.\`${table}\` TO ${sqlString(targets.apiV2Test)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}'`,
    }));
  }
  return Object.freeze(grants);
}

export function validateIsolatedApiAccountGrants({ domain, apiReadonlyGrants, apiV2TestGrants, databases, includeTablePrivileges = true } = {}) {
  const targetDomain = requireIsolatedApiDomain(domain);
  const targetDatabases = validateIsolatedApiDatabaseSet(databases);
  const expectedDatabases = new Set(Object.values(targetDatabases));
  const readonlyExpected = new Set([...expectedDatabases].map((database) => `${ISOLATED_API_READONLY_PRIVILEGES}|${database}|`));
  const readonlyObserved = nonUsageGrants(apiReadonlyGrants).map(apiGrantSignature);
  if (readonlyObserved.some((entry) => !entry || entry.host !== TEMPORARY_MYSQL_ACCOUNT_HOST
      || entry.table != null || !readonlyExpected.delete(`${entry.privileges}|${entry.database}|`))
      || readonlyExpected.size !== 0) {
    throw new Error('apiReadonly grants exceed the exact isolated database set or privilege scope');
  }

  const v2Expected = new Set([...expectedDatabases].map((database) => `${ISOLATED_API_V2_READ_PRIVILEGES}|${database}|`));
  if (includeTablePrivileges) {
    const writableTables = new Set(TABLE_OWNERSHIP_MATRIX
      .filter((entry) => entry.capability === targetDomain && entry.writeMode === 'write')
      .map((entry) => `${targetDatabases[entry.databaseRole]}|${entry.table}`));
    writableTables.add(`${targetDatabases.local}|crawler_automation_alert`);
    for (const table of writableTables) v2Expected.add(`${ISOLATED_API_V2_TABLE_PRIVILEGES}|${table}`);
  }
  const v2Observed = nonUsageGrants(apiV2TestGrants).map(apiGrantSignature);
  for (const entry of v2Observed) {
    if (!entry || entry.host !== TEMPORARY_MYSQL_ACCOUNT_HOST) {
      throw new Error('apiV2Test grant is not loopback-host and database/table scoped');
    }
    const key = `${entry.privileges}|${entry.database}|${entry.table ?? ''}`;
    if (!v2Expected.delete(key)) throw new Error('apiV2Test grant exceeds the exact run database/table privilege set');
  }
  if (v2Expected.size !== 0) throw new Error('apiV2Test grant set is missing an exact database/table grant');
  return true;
}

function sqlString(value) {
  const text = String(value ?? '');
  if (!/^[a-zA-Z0-9_.:@-]+$/.test(text)) throw new Error('unsafe SQL literal');
  return `'${text}'`;
}

function parseLines(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function readIsolatedSchemaFingerprint(client, database) {
  requireIdentifier(database, 'schema fingerprint database');
  const tables = parseLines(await client.query(
    "SELECT table_name, table_type, COALESCE(engine, '') FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
    database,
  ));
  const columns = parseLines(await client.query(
    "SELECT table_name, ordinal_position, column_name, column_type, is_nullable, COALESCE(HEX(column_default), ''), extra FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position",
    database,
  ));
  const indexes = parseLines(await client.query(
    "SELECT table_name, index_name, non_unique, seq_in_index, column_name, COALESCE(sub_part, 0), index_type FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index",
    database,
  ));
  const triggers = parseLines(await client.query(
    "SELECT trigger_name, event_manipulation, event_object_table, action_timing, SHA2(action_statement, 256) FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY trigger_name",
    database,
  ));
  const shape = Object.freeze({ tables, columns, indexes, triggers });
  return Object.freeze({
    database,
    tableCount: tables.length,
    tablesSha256: sha256Text(JSON.stringify(shape)),
    shape,
  });
}

function createRedisCommandClient({ host, port, password = '', execute = defaultExecute } = {}) {
  if (host !== '127.0.0.1') throw new Error('automation Redis host must be 127.0.0.1');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('automation Redis port is invalid');
  return Object.freeze({
    async command(logicalDb, ...commandArgs) {
      assertAutomationRedisLogicalDb(logicalDb, 'automation Redis logical DB');
      const args = ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), ...commandArgs.map(String)];
      const env = password ? { REDISCLI_AUTH: String(password) } : {};
      const result = await execute({ command: 'redis-cli', args, stdin: '', env });
      if (result.exitCode !== 0) {
        throw new Error(`redis command failed: ${String(result.stderr ?? '').trim() || `exit ${result.exitCode}`}`);
      }
      return String(result.stdout ?? '').trim();
    },
    async scan(logicalDb) {
      assertAutomationRedisLogicalDb(logicalDb, 'automation Redis logical DB');
      const args = ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), '--scan'];
      const env = password ? { REDISCLI_AUTH: String(password) } : {};
      const result = await execute({ command: 'redis-cli', args, stdin: '', env });
      if (result.exitCode !== 0) {
        throw new Error(`redis key scan failed: ${String(result.stderr ?? '').trim() || `exit ${result.exitCode}`}`);
      }
      return String(result.stdout ?? '').split(/\r?\n/).map((key) => key.trim()).filter(Boolean);
    }
  });
}

function migrationVersion(fileName) {
  const match = /^V(\d+)__.+\.sql$/.exec(fileName);
  return match ? Number(match[1]) : null;
}

function sha256Text(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

export function buildIsolatedMigrationInputManifest({ repoRoot } = {}) {
  const root = path.resolve(String(repoRoot ?? ''));
  if (!root || root === path.parse(root).root) throw new Error('migration manifest repoRoot is required');
  const sourceFiles = [
    ['maint', path.join(root, 'pipelines/maint/maint-schema.mjs'), buildMaintSchemaSql()],
    ['relation', path.join(root, 'pipelines/relation/relation-schema.mjs'), buildRelationSchemaStatements().join('\n')],
    ['projection', path.join(root, 'pipelines/relation/projection-schema.mjs'), buildProjectionSchemaStatements().join('\n')],
  ];
  const schemaBuilders = sourceFiles.map(([id, absolutePath, output]) => {
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`migration schema-builder source is missing: ${absolutePath}`);
    }
    return Object.freeze({
      id,
      path: path.relative(root, absolutePath).split(path.sep).join('/'),
      sourceSha256: sha256Text(fs.readFileSync(absolutePath, 'utf8')),
      outputSha256: sha256Text(output),
    });
  });
  const migrationDirectory = path.join(root, 'services/catalog-api/src/main/resources/db/migration');
  if (!fs.existsSync(migrationDirectory) || !fs.statSync(migrationDirectory).isDirectory()) {
    throw new Error(`isolated migration directory is missing: ${migrationDirectory}`);
  }
  const migrationFiles = fs.readdirSync(migrationDirectory)
    .filter((name) => migrationVersion(name) !== null)
    .sort((left, right) => migrationVersion(left) - migrationVersion(right))
    .map((name) => Object.freeze({
      path: path.relative(root, path.join(migrationDirectory, name)).split(path.sep).join('/'),
      version: migrationVersion(name),
      sha256: sha256Text(fs.readFileSync(path.join(migrationDirectory, name), 'utf8')),
    }));
  return Object.freeze({ schemaVersion: 1, schemaBuilders: Object.freeze(schemaBuilders), migrationFiles: Object.freeze(migrationFiles) });
}

function localMigrationSql(repoRoot, isolatedMaintDatabase, isolatedLocalDatabase) {
  const directory = path.join(repoRoot, 'services/catalog-api/src/main/resources/db/migration');
  const files = fs.readdirSync(directory)
    .filter((name) => migrationVersion(name) !== null)
    .sort((left, right) => migrationVersion(left) - migrationVersion(right));
  return files.map((file) => rewriteSchemaForIsolatedDatabase({
    sql: fs.readFileSync(path.join(directory, file), 'utf8'),
    replacements: { terria_v1_maint: isolatedMaintDatabase },
    targetDatabase: isolatedLocalDatabase
  }));
}

export function buildSchemaDumpArgs({ credentials, database, table } = {}) {
  requireIdentifier(database, 'frozen schema source database');
  requireIdentifier(table, 'frozen schema source table');
  return [
    '--protocol=TCP', '--host', credentials.host, '--port', String(credentials.port),
    '--user', credentials.username, '--no-data', '--no-tablespaces', '--single-transaction',
    '--skip-lock-tables', '--skip-triggers', '--skip-add-drop-table', '--compact', database, table
  ];
}

async function readFrozenCreateTable({ execute, credentials, database, table, targetDatabase }) {
  requireIdentifier(database, 'frozen schema source database');
  requireIdentifier(table, 'frozen schema source table');
  const result = await execute({
    command: 'mysqldump',
    args: buildSchemaDumpArgs({ credentials, database, table }),
    stdin: '',
    env: { MYSQL_PWD: credentials.password }
  });
  if (result.exitCode !== 0) {
    throw new Error(`frozen schema read failed for ${database}.${table}: ${String(result.stderr ?? '').trim()}`);
  }
  const match = String(result.stdout ?? '').match(/CREATE TABLE\s+`[^`]+`\s*\([\s\S]*?\)\s*ENGINE=[^;]+;/i);
  if (!match) throw new Error(`frozen schema DDL is missing for ${database}.${table}`);
  return rewriteFrozenCreateTable({ sourceSql: match[0], table, targetDatabase });
}

export async function createLiveAutomationAdapter({
  repoRoot,
  mysql,
  redis,
  domain,
  environmentId,
  accountNames,
  accountPasswords,
  isolatedApiDatabases = null,
  isolatedApiDomain = null,
  execute = defaultExecute,
  maxRowsPerTable = 2
} = {}) {
  const root = path.resolve(String(repoRoot ?? ''));
  if (domain !== undefined && domain !== null) {
    if (redis?.logicalDb === undefined || redis?.logicalDb === null) {
      throw new Error(`${String(domain)} recrawl requires an explicit Redis logical DB binding`);
    }
    assertAutomationRedisDomainLogicalDb(domain, redis.logicalDb);
  }
  const migrationInputManifest = buildIsolatedMigrationInputManifest({ repoRoot: root });
  const bootstrap = createMysqlCommandClient({ ...mysql, execute });
  const provisioner = createMysqlCommandClient({
    ...mysql, username: accountNames.provisioner, password: accountPasswords.provisioner, execute
  });
  const readonly = createMysqlCommandClient({
    ...mysql, username: accountNames.readonly, password: accountPasswords.readonly, execute
  });
  const isolatedApi = isolatedApiDatabases == null ? null : Object.freeze({
    databases: validateIsolatedApiDatabaseSet(isolatedApiDatabases),
    domain: requireIsolatedApiDomain(isolatedApiDomain),
    accountNames: validateIsolatedApiAccountNames(accountNames),
  });
  if (isolatedApi) {
    const allNames = [accountNames.provisioner, accountNames.readonly, isolatedApi.accountNames.apiReadonly, isolatedApi.accountNames.apiV2Test]
      .map((name) => requireIdentifier(name, 'temporary account'));
    if (new Set(allNames).size !== allNames.length) throw new Error('temporary account names must be distinct');
    for (const role of ['apiReadonly', 'apiV2Test']) {
      if (!String(accountPasswords?.[role] ?? '') || /[\r\n\0]/.test(accountPasswords[role])) {
        throw new Error(`isolated API ${role} password is required`);
      }
    }
  }
  const apiReadonly = isolatedApi ? createMysqlCommandClient({
    ...mysql, username: isolatedApi.accountNames.apiReadonly, password: accountPasswords.apiReadonly, execute
  }) : null;
  const apiV2Test = isolatedApi ? createMysqlCommandClient({
    ...mysql, username: isolatedApi.accountNames.apiV2Test, password: accountPasswords.apiV2Test, execute
  }) : null;
  const redisClient = createRedisCommandClient({ ...redis, execute });
  const snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-automation-snapshot-'));
  fs.chmodSync(snapshotDirectory, 0o700);
  const snapshots = new Map();
  let accountsCreated = false;
  let accountsAttempted = false;
  let activeReservation = null;
  let apiAccountGrantEvidence = null;
  let apiTablePrivilegesGranted = false;
  const appliedMigrations = [];
  const schemaFingerprints = new Map();

  async function ensureAccounts() {
    if (accountsCreated) return;
    const p = requireIdentifier(accountNames.provisioner, 'provisioner account');
    const r = requireIdentifier(accountNames.readonly, 'read-only account');
    const pp = sqlString(accountPasswords.provisioner);
    const rp = sqlString(accountPasswords.readonly);
    accountsAttempted = true;
    await bootstrap.query(`CREATE USER ${sqlString(p)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}' IDENTIFIED BY ${pp}`);
    await bootstrap.query(`CREATE USER ${sqlString(r)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}' IDENTIFIED BY ${rp}`);
    if (isolatedApi) {
      for (const role of ['apiReadonly', 'apiV2Test']) {
        await bootstrap.query(
          `CREATE USER ${sqlString(isolatedApi.accountNames[role])}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}' IDENTIFIED BY ${sqlString(accountPasswords[role])}`
        );
      }
    }
    for (const name of Object.values(FORMAL_DATABASES)) {
      await bootstrap.query(`GRANT SELECT, SHOW VIEW ON \`${name}\`.* TO ${sqlString(r)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}'`);
    }
    accountsCreated = true;
  }

  const adapter = {
    async inspectServer() {
      const serverUuid = (await bootstrap.query('SELECT @@server_uuid')).trim();
      if (!serverUuid) throw new Error('MySQL server UUID is missing');
      return {
        host: mysql.host, port: mysql.port, serverUuid,
        redisHost: redis.host, redisPort: redis.port, environmentId
      };
    },
    async inspectProvisioner() {
      await ensureAccounts();
      return { credentialRole: 'automation-provisioner' };
    },
    async grantProvisioner({ name }) {
      requireIdentifier(name, 'isolated grant database');
      if (isolatedApi && !Object.values(isolatedApi.databases).includes(name)) {
        throw new Error('isolated API grants are forbidden outside the exact run database set');
      }
      await bootstrap.query(`GRANT ALL PRIVILEGES ON \`${name}\`.* TO ${sqlString(accountNames.provisioner)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}'`);
      if (isolatedApi) {
        for (const grant of buildIsolatedApiAccountGrants({
          domain: isolatedApi.domain,
          databases: isolatedApi.databases,
          accountNames: isolatedApi.accountNames,
        }).filter((entry) => entry.database === name && entry.table == null)) {
          await bootstrap.query(grant.sql);
        }
      }
    },
    async grantIsolatedApiTablePrivileges({ runKey } = {}) {
      if (!isolatedApi || !accountsCreated) throw new Error('isolated API accounts must exist before table-scoped grants');
      const expectedPrefix = `terria_v1_automation_acceptance_${runKey}_`;
      const expectedDatabaseNames = Object.fromEntries(ISOLATED_API_DATABASE_ROLES.map((role) => [role, `${expectedPrefix}${role}`]));
      if (Object.entries(expectedDatabaseNames).some(([role, name]) => isolatedApi.databases[role] !== name)) {
        throw new Error('isolated API table grants differ from the exact run-derived schema set');
      }
      const pendingMigrations = ISOLATED_API_DATABASE_ROLES.filter((role) => !appliedMigrations.some((entry) => (
        entry.role === role && entry.database === expectedDatabaseNames[role]
      )));
      if (pendingMigrations.length > 0) throw new Error(`isolated API table grants require migrations first: ${pendingMigrations.join(', ')}`);
      const tableGrants = buildIsolatedApiAccountGrants({
        domain: isolatedApi.domain,
        databases: isolatedApi.databases,
        accountNames: isolatedApi.accountNames,
      }).filter((entry) => entry.role === 'apiV2Test' && entry.table != null);
      const missingTables = [];
      for (const grant of tableGrants) {
        const count = Number((await provisioner.query(
          `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${sqlString(grant.table)}`,
          grant.database,
        )).trim());
        if (count !== 1) missingTables.push(`${grant.database}.${grant.table}`);
      }
      if (missingTables.length > 0) {
        throw new Error(`isolated API table grants require migrated schemas; missing tables: ${missingTables.slice(0, 8).join(', ')}`);
      }
      for (const grant of tableGrants) await bootstrap.query(grant.sql);
      apiTablePrivilegesGranted = true;
      return Object.freeze({ status: 'granted', runKey, tableGrantCount: tableGrants.length });
    },
    async verifyProvisionerGrants(input) {
      const provisionerGrants = parseLines(await provisioner.query('SHOW GRANTS'));
      const readonlyGrants = parseLines(await readonly.query('SHOW GRANTS'));
      const databases = Object.fromEntries(provisionerGrants.map((grant) => {
        const match = grant.match(/ ON `?([a-z0-9_]+)`?\.\*/i);
        return match && !Object.values(FORMAL_DATABASES).includes(match[1]) ? [match[1].split('_').at(-1), match[1]] : null;
      }).filter(Boolean));
      validateTemporaryAccountGrants({ provisionerGrants, readonlyGrants, databases });
      if (isolatedApi) {
        const apiReadonlyGrants = parseLines(await apiReadonly.query('SHOW GRANTS'));
        const apiV2TestGrants = parseLines(await apiV2Test.query('SHOW GRANTS'));
        validateIsolatedApiAccountGrants({
          domain: isolatedApi.domain,
          apiReadonlyGrants,
          apiV2TestGrants,
          databases: isolatedApi.databases,
          includeTablePrivileges: input?.apiTableGrantsPending !== true,
        });
        if (input?.apiTableGrantsPending !== true) {
          if (!apiTablePrivilegesGranted) throw new Error('isolated API table privileges have not been granted after migration');
          apiAccountGrantEvidence = Object.freeze({
            status: 'verified',
            domain: isolatedApi.domain,
            databases: isolatedApi.databases,
            apiReadonly: Object.freeze({
              username: isolatedApi.accountNames.apiReadonly,
              grantCount: nonUsageGrants(apiReadonlyGrants).length,
              grantsSha256: hashGrantSet(apiReadonlyGrants),
            }),
            apiV2Test: Object.freeze({
              username: isolatedApi.accountNames.apiV2Test,
              grantCount: nonUsageGrants(apiV2TestGrants).length,
              grantsSha256: hashGrantSet(apiV2TestGrants),
            }),
          });
        }
      }
      return {
        ...input,
        t2WriteDenied: true,
        ...(isolatedApi ? (input?.apiTableGrantsPending === true
          ? { apiDatabaseAccountsVerified: true }
          : { apiAccountsVerified: true }) : {}),
      };
    },
    async allocateRedisLogicalDb({ runKey }) {
      const reservationToken = randomBytes(24).toString('hex');
      const candidates = domain !== undefined && domain !== null
        ? [assertAutomationRedisDomainLogicalDb(domain, redis.logicalDb)]
        : redis.logicalDb != null
        ? [assertAutomationRedisLogicalDb(redis.logicalDb, 'automation Redis logical DB')]
        : Array.from({ length: AUTOMATION_REDIS_LOGICAL_DB_MAX }, (_, index) => AUTOMATION_REDIS_LOGICAL_DB_MAX - index);
      for (const logicalDb of candidates) {
        if (await redisClient.command(logicalDb, 'DBSIZE') !== '0') continue;
        const result = await redisClient.command(logicalDb, 'SET', AUTOMATION_REDIS_RESERVATION_KEY,
          `${runKey}:${reservationToken}`, 'NX');
        if (result === 'OK') {
          activeReservation = { logicalDb, runKey, reservationToken };
          return { host: redis.host, port: redis.port, logicalDb, reservationToken };
        }
      }
      throw new Error('no empty isolated Redis logical database is available');
    },
    async verifyRedisReservation(input) {
      const value = await redisClient.command(input.logicalDb, 'GET', 'terrapedia:automation:reservation');
      if (value !== `${input.runKey}:${input.reservationToken}`) throw new Error('Redis reservation token mismatch');
      return { ...input, exclusive: true, ownerRunKey: input.runKey };
    },
    async releaseRedisLogicalDb(input) {
      const value = await redisClient.command(input.logicalDb, 'GET', AUTOMATION_REDIS_RESERVATION_KEY);
      if (!value && input.ifMissing) return;
      if (value !== `${input.runKey}:${input.reservationToken}`) throw new Error('Redis cleanup token mismatch');
      const keys = await redisClient.scan(input.logicalDb);
      const unownedKeys = keys.filter((key) => key !== AUTOMATION_REDIS_RESERVATION_KEY
        && !OWNED_REDIS_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));
      if (unownedKeys.length) {
        throw new Error(`unregistered Redis keys block cleanup: ${unownedKeys.slice(0, 8).join(', ')}`);
      }
      const ownedKeys = keys.filter((key) => key !== AUTOMATION_REDIS_RESERVATION_KEY);
      if (ownedKeys.length) await redisClient.command(input.logicalDb, 'DEL', ...ownedKeys);
      const remainingKeys = await redisClient.scan(input.logicalDb);
      const unremovedKeys = remainingKeys.filter((key) => key !== AUTOMATION_REDIS_RESERVATION_KEY);
      if (unremovedKeys.length) {
        throw new Error(`Redis keys remained after exact-key cleanup: ${unremovedKeys.slice(0, 8).join(', ')}`);
      }
      await redisClient.command(input.logicalDb, 'DEL', AUTOMATION_REDIS_RESERVATION_KEY);
      if (await redisClient.command(input.logicalDb, 'DBSIZE') !== '0') {
        throw new Error('Redis logical DB is non-empty after exact-key cleanup');
      }
      activeReservation = null;
    },
    async createDatabase({ name }) {
      requireIdentifier(name, 'isolated database');
      await bootstrap.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    },
    async migrateDatabase({ name, role, runKey, profile }) {
      requireIdentifier(name, 'migration database');
      const expectedPrefix = profile === 't0' ? 'terria_v1_automation_test_' : 'terria_v1_automation_acceptance_';
      if (!name.startsWith(`${expectedPrefix}${runKey}_`)) throw new Error('migration database is outside the runKey prefix');
      const appliedSql = [];
      if (role === 'maint') {
        const sql = rewriteSchemaForIsolatedDatabase({
          sql: buildMaintSchemaSql(), replacements: {}, targetDatabase: name
        });
        await provisioner.query(sql, name);
        appliedSql.push(sha256Text(sql));
      } else if (role === 'relation') {
        for (const statement of [...buildRelationSchemaStatements(), ...buildProjectionSchemaStatements()]) {
          const rewritten = rewriteSchemaForIsolatedDatabase({
            sql: statement,
            replacements: { terria_v1_relation: name },
            targetDatabase: name
          });
          await provisioner.query(rewritten, name);
          appliedSql.push(sha256Text(rewritten));
        }
      } else if (role === 'local') {
        const maintName = name.replace(/_local$/, '_maint');
        for (const sql of localMigrationSql(root, maintName, name)) {
          const client = requiresBootstrapMigrationSession(sql) ? bootstrap : provisioner;
          const cliSql = client === bootstrap ? rewriteMysqlCliCompoundTriggerDelimiters(sql) : sql;
          await client.query(cliSql, name);
          appliedSql.push(sha256Text(cliSql));
        }
      } else {
        throw new Error(`unknown migration role: ${role}`);
      }
      const fingerprint = await readIsolatedSchemaFingerprint(provisioner, name);
      const inputManifestHash = sha256Text(JSON.stringify(migrationInputManifest));
      const evidence = Object.freeze({
        role,
        database: name,
        inputManifestHash,
        appliedSqlSha256: Object.freeze(appliedSql),
        schemaFingerprint: fingerprint,
      });
      appliedMigrations.push(evidence);
      schemaFingerprints.set(name, fingerprint);
      return evidence;
    },
    async refreshMigrationSchemaFingerprints({ databases } = {}) {
      if (!isolatedApi || !databases || Object.keys(databases).sort().join(',') !== 'local,maint,relation') {
        throw new Error('schema fingerprint refresh requires the exact isolated API database set');
      }
      for (const [role, database] of Object.entries(databases)) {
        const appliedIndex = appliedMigrations.findIndex((entry) => entry.role === role && entry.database === database.name);
        if (appliedIndex < 0) throw new Error(`schema fingerprint refresh has no prior migration record for ${role}`);
        const schemaFingerprint = await readIsolatedSchemaFingerprint(provisioner, database.name);
        schemaFingerprints.set(database.name, schemaFingerprint);
        appliedMigrations[appliedIndex] = Object.freeze({
          ...appliedMigrations[appliedIndex],
          schemaFingerprint,
        });
      }
      return adapter.getMigrationEvidence();
    },
    async verifyReadOnlySnapshot({ snapshotId, dependencyManifest = null }) {
      await ensureAccounts();
      const serverUuid = (await readonly.query('SELECT @@server_uuid')).trim();
      if (dependencyManifest != null) {
        if (!isolatedApi) throw new Error('exact dependency snapshot requires an isolated API allocation');
        const databases = Object.fromEntries(Object.entries(isolatedApi.databases).map(([role, database]) => [role, database]));
        const validated = validateDependencyManifest(dependencyManifest, { databases });
        if (validated.domain !== isolatedApi.domain) throw new Error('dependency manifest domain differs from the isolated API allocation');
        const tables = validated.dependencies.map((entry) => {
          const role = Object.entries(isolatedApi.databases).find(([, database]) => database === entry.target.database)?.[0];
          return Object.freeze({
            role,
            table: entry.source.table,
            maxRows: entry.expectedRowCount,
            sourceCount: entry.expectedRowCount,
            sourceAvailable: true,
            sampleHash: sha256Text(JSON.stringify(entry.rowHashes)),
            schemaHash: null,
          });
        });
        const snapshot = {
          snapshotId,
          profile: 't2-readonly',
          readOnly: true,
          scrubbed: true,
          snapshotHash: dependencyManifestSha256(validated),
          credentialRole: 'automation-readonly',
          serverFingerprints: Object.entries(FORMAL_DATABASES).map(([role, name]) => ({
            role, name, host: mysql.host, port: mysql.port, serverUuid,
          })),
          databases: { ...FORMAL_DATABASES },
          tables,
        };
        snapshots.set(snapshotId, { ...snapshot, privateTables: [], privateDependencyManifest: validated });
        return snapshot;
      }
      const plan = buildBoundedSnapshotPlan({ maxRowsPerTable });
      const tables = [];
      for (const entry of plan) {
        const sourceDatabase = FORMAL_DATABASES[entry.role];
        const sourceAvailable = Number((await readonly.query(
          `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${sourceDatabase}' AND table_name = '${entry.table}'`,
        )).trim()) === 1;
        if (!sourceAvailable) {
          tables.push(buildUnavailableSourceSnapshotEntry(entry));
          continue;
        }
        const countText = await readonly.query(`SELECT COUNT(*) FROM \`${entry.table}\``, sourceDatabase);
        const columnOutput = await readonly.query(
          `SELECT column_name, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${entry.table}' ORDER BY ordinal_position`,
          sourceDatabase
        );
        const columns = parseLines(columnOutput).map((line) => line.split('\t'))
          .filter(([, extra]) => !/GENERATED/i.test(extra ?? ''))
          .map(([column]) => column)
          .filter((column) => !SENSITIVE_COLUMN.test(column));
        if (!columns.length) throw new Error(`snapshot source table is missing or unsafe: ${entry.role}.${entry.table}`);
        const rowOutput = await readonly.query(buildSnapshotRowSelect({
          table: entry.table, columns, maxRows: entry.maxRows
        }), sourceDatabase);
        const rows = parseLines(rowOutput).map((line) => JSON.parse(line));
        const targetDatabase = sourceDatabase.replace(/^terria_v1_/, 'terria_v1_automation_snapshot_placeholder_');
        const schemaSql = await readFrozenCreateTable({
          execute,
          credentials: { ...mysql, username: accountNames.readonly, password: accountPasswords.readonly },
          database: sourceDatabase,
          table: entry.table,
          targetDatabase
        });
        const frozenContent = `${JSON.stringify({ columns, rows, schemaSql })}\n`;
        const samplePath = path.join(snapshotDirectory, `${entry.role}__${entry.table}.json`);
        fs.writeFileSync(samplePath, frozenContent, { mode: 0o600, flag: 'wx' });
        tables.push({
          ...entry,
          sourceCount: Number(countText.trim()),
          sourceAvailable: true,
          sampleHash: `sha256:${createHash('sha256').update(frozenContent).digest('hex')}`,
          schemaHash: `sha256:${createHash('sha256').update(schemaSql).digest('hex')}`,
          sourceColumnCount: columns.length,
          samplePath
        });
      }
      const snapshotHash = `sha256:${createHash('sha256').update(JSON.stringify(
        tables.map(({ role, table, maxRows, sourceCount, sourceAvailable, sampleHash }) => ({
          role, table, maxRows, sourceCount, sourceAvailable, sampleHash
        }))
      )).digest('hex')}`;
      const publicTables = tables.map(({ role, table, maxRows, sourceCount, sourceAvailable, sampleHash, schemaHash }) => ({
        role, table, maxRows, sourceCount, sourceAvailable, sampleHash, schemaHash
      }));
      const snapshot = {
        snapshotId, profile: 't2-readonly', readOnly: true, scrubbed: true, snapshotHash,
        credentialRole: 'automation-readonly',
        serverFingerprints: Object.entries(FORMAL_DATABASES).map(([role, name]) => ({
          role, name, host: mysql.host, port: mysql.port, serverUuid
        })),
        databases: { ...FORMAL_DATABASES }, tables: publicTables
      };
      snapshots.set(snapshotId, { ...snapshot, privateTables: tables });
      return snapshot;
    },
    async copyReadOnlySnapshot({ sourceSnapshot, targetDatabases, scrubSensitive }) {
      if (scrubSensitive !== true) throw new Error('snapshot copy must scrub sensitive payloads');
      const snapshot = snapshots.get(sourceSnapshot.snapshotId);
      if (!snapshot || snapshot.snapshotHash !== sourceSnapshot.snapshotHash) throw new Error('snapshot content identity mismatch');
      if (snapshot.privateDependencyManifest) throw new Error('exact dependency snapshots cannot use bounded table sampling');
      for (const table of snapshot.privateTables) {
        const targetDatabase = targetDatabases[table.role].name;
        let columnOutput = await provisioner.query(
          `SELECT column_name, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table.table}' ORDER BY ordinal_position`,
          targetDatabase
        );
        if (table.sourceAvailable === false) {
          if (!parseLines(columnOutput).length) {
            throw new Error(`pre-cutover target table is missing for ${table.role}.${table.table}`);
          }
          const targetCount = Number((await provisioner.query(
            `SELECT COUNT(*) FROM \`${table.table}\``, targetDatabase
          )).trim());
          if (targetCount !== 0) {
            throw new Error(`pre-cutover target table is not empty for ${table.role}.${table.table}`);
          }
          continue;
        }
        const frozen = JSON.parse(fs.readFileSync(table.samplePath, 'utf8'));
        if (!parseLines(columnOutput).length) {
          const schemaSql = rewriteFrozenCreateTable({
            sourceSql: frozen.schemaSql,
            table: table.table,
            targetDatabase
          });
          await provisioner.query(`SET FOREIGN_KEY_CHECKS=0;\n${schemaSql};\nSET FOREIGN_KEY_CHECKS=1;`, targetDatabase);
          columnOutput = await provisioner.query(
            `SELECT column_name, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table.table}' ORDER BY ordinal_position`,
            targetDatabase
          );
        }
        const targetColumns = parseLines(columnOutput).map((line) => line.split('\t'))
          .filter(([, extra]) => !/GENERATED/i.test(extra ?? ''))
          .map(([column]) => column);
        const inserts = frozen.rows.map((row) => buildSnapshotInsertSql({
          table: table.table,
          row: buildSnapshotTargetRow({
            role: table.role, table: table.table, row, targetColumns
          }),
          targetColumns
        }));
        if (inserts.length) {
          await provisioner.query(`SET FOREIGN_KEY_CHECKS=0;\n${inserts.join(';\n')};\nSET FOREIGN_KEY_CHECKS=1;`, targetDatabase);
        }
      }
    },
    async verifyCopiedSnapshot({ sourceSnapshot, targetDatabases }) {
      const snapshot = snapshots.get(sourceSnapshot.snapshotId);
      if (!snapshot || snapshot.snapshotHash !== sourceSnapshot.snapshotHash) throw new Error('snapshot verification identity mismatch');
      const counts = [];
      for (const table of snapshot.privateTables) {
        const targetDatabase = targetDatabases[table.role].name;
        const targetColumnOutput = await provisioner.query(
          `SELECT column_name, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table.table}' ORDER BY ordinal_position`,
          targetDatabase
        );
        const count = Number((await provisioner.query(
          `SELECT COUNT(*) FROM \`${table.table}\``, targetDatabases[table.role].name
        )).trim());
        if (!Number.isInteger(count) || count < 0) throw new Error(`snapshot target count is invalid for ${table.role}.${table.table}`);
        if (table.sourceAvailable === false) {
          if (!parseLines(targetColumnOutput).length || count !== 0) {
            throw new Error(`pre-cutover target table must exist and remain empty for ${table.role}.${table.table}`);
          }
          counts.push({
            role: table.role,
            table: table.table,
            sourceCount: 0,
            sourceAvailable: false,
            targetCount: 0,
            sampleHash: null,
            verificationHash: null,
          });
          continue;
        }
        if (table.sourceCount > 0 && count < 1) throw new Error(`snapshot representative sample is missing for ${table.role}.${table.table}`);
        const targetColumns = parseLines(targetColumnOutput).map((line) => line.split('\t'))
          .filter(([, extra]) => !/GENERATED/i.test(extra ?? ''))
          .map(([column]) => column);
        const frozen = JSON.parse(fs.readFileSync(table.samplePath, 'utf8'));
        const projectedRows = [];
        for (const row of frozen.rows) {
          const targetRow = buildSnapshotTargetRow({
            role: table.role, table: table.table, row, targetColumns
          });
          const matched = Number((await provisioner.query(
            buildSnapshotRowMatchSql({ table: table.table, row: targetRow, targetColumns }), targetDatabase
          )).trim());
          if (!Number.isInteger(matched) || matched < 1) {
            throw new Error(`snapshot frozen row mismatch for ${table.role}.${table.table}`);
          }
          const columns = commonSnapshotColumns(targetRow, targetColumns);
          projectedRows.push(Object.fromEntries(columns.map((column) => [column, targetRow[column]])));
        }
        const verificationHash = `sha256:${createHash('sha256').update(JSON.stringify(projectedRows)).digest('hex')}`;
        counts.push({
          role: table.role, table: table.table, sourceCount: table.sourceCount,
          targetCount: count, sampleHash: table.sampleHash, verificationHash
        });
      }
      return {
        verified: true,
        verificationHash: `sha256:${createHash('sha256').update(JSON.stringify(counts)).digest('hex')}`,
        tables: counts
      };
    },
    async seedExactDependencies({ manifest, targetDatabases, runKey }) {
      if (!isolatedApi) throw new Error('exact dependency seeding requires an isolated API allocation');
      if (runKey !== undefined && manifest?.runKey !== runKey) throw new Error('dependency manifest runKey mismatch');
      const databases = Object.fromEntries(Object.entries(targetDatabases ?? {}).map(([role, database]) => [role, database.name]));
      return seedExactDependencies({ manifest, databases, readonlyClient: readonly, provisionerClient: provisioner });
    },
    async dropDatabase({ name, role, runKey, compensation = false }) {
      requireIdentifier(name, 'cleanup database');
      if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey ?? '')) throw new Error('cleanup runKey is invalid');
      if (!['local', 'maint', 'relation'].includes(role)
          || !(name === `terria_v1_automation_acceptance_${runKey}_${role}`
            || name === `terria_v1_automation_test_${runKey}_${role}`)
          || Object.values(FORMAL_DATABASES).includes(name)) {
        throw new Error('cleanup database must be the exact runKey and role tuple');
      }
      await (compensation ? bootstrap : provisioner).query(`DROP DATABASE IF EXISTS \`${name}\``);
    },
    async cleanupAccounts() {
      const cleanupErrors = [];
      try {
        if (activeReservation) {
          try {
            await adapter.releaseRedisLogicalDb({
              ...activeReservation,
              logicalDb: activeReservation.logicalDb,
              reservationToken: activeReservation.reservationToken,
              runKey: activeReservation.runKey,
              ifMissing: true,
              compensation: true,
            });
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (accountsAttempted) {
          const users = [accountNames.provisioner, accountNames.readonly,
            ...(isolatedApi ? [isolatedApi.accountNames.apiReadonly, isolatedApi.accountNames.apiV2Test] : [])]
            .map((name) => `${sqlString(name)}@'${TEMPORARY_MYSQL_ACCOUNT_HOST}'`);
          try {
            await bootstrap.query(`DROP USER IF EXISTS ${users.join(', ')}`);
            const userNames = [accountNames.provisioner, accountNames.readonly,
              ...(isolatedApi ? [isolatedApi.accountNames.apiReadonly, isolatedApi.accountNames.apiV2Test] : [])]
              .map(sqlString).join(', ');
            const remaining = Number((await bootstrap.query(
              `SELECT COUNT(*) FROM mysql.user WHERE User IN (${userNames})`
            )).trim());
            if (remaining !== 0) throw new Error('temporary automation accounts still exist after cleanup');
            accountsCreated = false;
            accountsAttempted = false;
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'automation resource cleanup failed');
      } finally {
        fs.rmSync(snapshotDirectory, { recursive: true, force: true });
      }
    },
    async verifyCleanup({ databases, logicalDb }) {
      const names = Object.values(databases);
      const inList = names.map(sqlString).join(', ');
      const remainingDatabases = Number((await bootstrap.query(
        `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN (${inList})`
      )).trim());
      if (remainingDatabases !== 0) throw new Error('isolated automation databases remain after cleanup');
      if (await redisClient.command(logicalDb, 'DBSIZE') !== '0') throw new Error('isolated Redis database remains non-empty after cleanup');
      return true;
    },
    provisionerClient: provisioner,
    readonlyClient: readonly,
    apiAccounts: isolatedApi ? Object.freeze({
      apiReadonly: Object.freeze({ role: 'apiReadonly', username: isolatedApi.accountNames.apiReadonly, password: accountPasswords.apiReadonly }),
      apiV2Test: Object.freeze({ role: 'apiV2Test', username: isolatedApi.accountNames.apiV2Test, password: accountPasswords.apiV2Test }),
    }) : null,
    getApiAccountGrantEvidence: () => apiAccountGrantEvidence,
    getMigrationEvidence: () => Object.freeze({
      status: appliedMigrations.length === 3 && schemaFingerprints.size === 3 ? 'verified' : 'incomplete',
      inputManifest: migrationInputManifest,
      inputManifestHash: sha256Text(JSON.stringify(migrationInputManifest)),
      applied: Object.freeze([...appliedMigrations]),
    }),
    migrationEvidenceRequired: isolatedApi != null,
  };
  return Object.freeze(adapter);
}

function hashGrantSet(grants) {
  const normalized = nonUsageGrants(grants).sort();
  return `sha256:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
}
