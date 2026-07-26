import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FORMAL_DATABASES } from './automation-database-contract.mjs';
import { TABLE_OWNERSHIP_MATRIX } from './table-ownership-matrix.mjs';
import { buildMaintSchemaSql } from '../maint/maint-schema.mjs';
import { buildProjectionSchemaStatements } from '../relation/projection-schema.mjs';
import { buildRelationSchemaStatements } from '../relation/relation-schema.mjs';

const IDENTIFIER = /^[a-z0-9_]+$/;
const FORMAL_REFERENCE = /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i;
const SENSITIVE_COLUMN = /(?:password|passwd|secret|token|email|phone|credential|session|cookie)/i;

function requireIdentifier(value, label) {
  const text = String(value ?? '');
  if (!IDENTIFIER.test(text)) throw new Error(`${label} is not a safe identifier`);
  return text;
}

function defaultExecute({ command, args, stdin, env }) {
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
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
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

function sqlString(value) {
  const text = String(value ?? '');
  if (!/^[a-zA-Z0-9_.:@-]+$/.test(text)) throw new Error('unsafe SQL literal');
  return `'${text}'`;
}

function parseLines(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function createRedisCommandClient({ host, port, password = '', execute = defaultExecute } = {}) {
  if (host !== '127.0.0.1') throw new Error('automation Redis host must be 127.0.0.1');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('automation Redis port is invalid');
  return Object.freeze({
    async command(logicalDb, ...commandArgs) {
      if (!Number.isInteger(logicalDb) || logicalDb < 1 || logicalDb > 14) {
        throw new Error('automation Redis logical DB must be between 1 and 14');
      }
      const args = ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), ...commandArgs.map(String)];
      const env = password ? { REDISCLI_AUTH: String(password) } : {};
      const result = await execute({ command: 'redis-cli', args, stdin: '', env });
      if (result.exitCode !== 0) {
        throw new Error(`redis command failed: ${String(result.stderr ?? '').trim() || `exit ${result.exitCode}`}`);
      }
      return String(result.stdout ?? '').trim();
    }
  });
}

function migrationVersion(fileName) {
  const match = /^V(\d+)__.+\.sql$/.exec(fileName);
  return match ? Number(match[1]) : null;
}

function localMigrationSql(repoRoot, isolatedMaintDatabase, isolatedLocalDatabase) {
  const directory = path.join(repoRoot, 'back/src/main/resources/db/migration');
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
  environmentId,
  accountNames,
  accountPasswords,
  execute = defaultExecute,
  maxRowsPerTable = 2
} = {}) {
  const root = path.resolve(String(repoRoot ?? ''));
  const bootstrap = createMysqlCommandClient({ ...mysql, execute });
  const provisioner = createMysqlCommandClient({
    ...mysql, username: accountNames.provisioner, password: accountPasswords.provisioner, execute
  });
  const readonly = createMysqlCommandClient({
    ...mysql, username: accountNames.readonly, password: accountPasswords.readonly, execute
  });
  const redisClient = createRedisCommandClient({ ...redis, execute });
  const snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-automation-snapshot-'));
  fs.chmodSync(snapshotDirectory, 0o700);
  const snapshots = new Map();
  let accountsCreated = false;
  let accountsAttempted = false;
  let activeReservation = null;

  async function ensureAccounts() {
    if (accountsCreated) return;
    const p = requireIdentifier(accountNames.provisioner, 'provisioner account');
    const r = requireIdentifier(accountNames.readonly, 'read-only account');
    const pp = sqlString(accountPasswords.provisioner);
    const rp = sqlString(accountPasswords.readonly);
    accountsAttempted = true;
    await bootstrap.query(`CREATE USER ${sqlString(p)}@'%' IDENTIFIED BY ${pp}`);
    await bootstrap.query(`CREATE USER ${sqlString(r)}@'%' IDENTIFIED BY ${rp}`);
    for (const name of Object.values(FORMAL_DATABASES)) {
      await bootstrap.query(`GRANT SELECT, SHOW VIEW ON \`${name}\`.* TO ${sqlString(r)}@'%'`);
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
      await bootstrap.query(`GRANT ALL PRIVILEGES ON \`${name}\`.* TO ${sqlString(accountNames.provisioner)}@'%'`);
    },
    async verifyProvisionerGrants(input) {
      const provisionerGrants = parseLines(await provisioner.query('SHOW GRANTS'));
      const readonlyGrants = parseLines(await readonly.query('SHOW GRANTS'));
      const databases = Object.fromEntries(provisionerGrants.map((grant) => {
        const match = grant.match(/ ON `?([a-z0-9_]+)`?\.\*/i);
        return match && !Object.values(FORMAL_DATABASES).includes(match[1]) ? [match[1].split('_').at(-1), match[1]] : null;
      }).filter(Boolean));
      validateTemporaryAccountGrants({ provisionerGrants, readonlyGrants, databases });
      return { ...input, t2WriteDenied: true };
    },
    async allocateRedisLogicalDb({ runKey }) {
      const reservationToken = randomBytes(24).toString('hex');
      const candidates = redis.logicalDb ? [redis.logicalDb] : Array.from({ length: 14 }, (_, index) => 14 - index);
      for (const logicalDb of candidates) {
        if (await redisClient.command(logicalDb, 'DBSIZE') !== '0') continue;
        const result = await redisClient.command(logicalDb, 'SET', 'terrapedia:automation:reservation',
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
      const value = await redisClient.command(input.logicalDb, 'GET', 'terrapedia:automation:reservation');
      if (!value && input.ifMissing) return;
      if (value !== `${input.runKey}:${input.reservationToken}`) throw new Error('Redis cleanup token mismatch');
      await redisClient.command(input.logicalDb, 'FLUSHDB');
      activeReservation = null;
    },
    async createDatabase({ name }) {
      requireIdentifier(name, 'isolated database');
      await provisioner.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    },
    async migrateDatabase({ name, role, runKey, profile }) {
      requireIdentifier(name, 'migration database');
      const expectedPrefix = profile === 't0' ? 'terria_v1_automation_test_' : 'terria_v1_automation_acceptance_';
      if (!name.startsWith(`${expectedPrefix}${runKey}_`)) throw new Error('migration database is outside the runKey prefix');
      if (role === 'maint') {
        await provisioner.query(rewriteSchemaForIsolatedDatabase({
          sql: buildMaintSchemaSql(), replacements: {}, targetDatabase: name
        }), name);
      } else if (role === 'relation') {
        for (const statement of [...buildRelationSchemaStatements(), ...buildProjectionSchemaStatements()]) {
          const rewritten = rewriteSchemaForIsolatedDatabase({
            sql: statement,
            replacements: { terria_v1_relation: name },
            targetDatabase: name
          });
          await provisioner.query(rewritten, name);
        }
      } else if (role === 'local') {
        const maintName = name.replace(/_local$/, '_maint');
        for (const sql of localMigrationSql(root, maintName, name)) {
          const client = requiresBootstrapMigrationSession(sql) ? bootstrap : provisioner;
          await client.query(sql, name);
        }
      } else {
        throw new Error(`unknown migration role: ${role}`);
      }
    },
    async verifyReadOnlySnapshot({ snapshotId }) {
      await ensureAccounts();
      const serverUuid = (await readonly.query('SELECT @@server_uuid')).trim();
      const plan = buildBoundedSnapshotPlan({ maxRowsPerTable });
      const tables = [];
      for (const entry of plan) {
        const sourceDatabase = FORMAL_DATABASES[entry.role];
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
          sampleHash: `sha256:${createHash('sha256').update(frozenContent).digest('hex')}`,
          schemaHash: `sha256:${createHash('sha256').update(schemaSql).digest('hex')}`,
          sourceColumnCount: columns.length,
          samplePath
        });
      }
      const snapshotHash = `sha256:${createHash('sha256').update(JSON.stringify(
        tables.map(({ role, table, maxRows, sourceCount, sampleHash }) => ({ role, table, maxRows, sourceCount, sampleHash }))
      )).digest('hex')}`;
      const publicTables = tables.map(({ role, table, maxRows, sourceCount, sampleHash, schemaHash }) => ({
        role, table, maxRows, sourceCount, sampleHash, schemaHash
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
      for (const table of snapshot.privateTables) {
        const targetDatabase = targetDatabases[table.role].name;
        let columnOutput = await provisioner.query(
          `SELECT column_name, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table.table}' ORDER BY ordinal_position`,
          targetDatabase
        );
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
          table: table.table, row, targetColumns
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
        const count = Number((await provisioner.query(
          `SELECT COUNT(*) FROM \`${table.table}\``, targetDatabases[table.role].name
        )).trim());
        if (!Number.isInteger(count) || count < 0) throw new Error(`snapshot target count is invalid for ${table.role}.${table.table}`);
        if (table.sourceCount > 0 && count < 1) throw new Error(`snapshot representative sample is missing for ${table.role}.${table.table}`);
        const targetColumnOutput = await provisioner.query(
          `SELECT column_name, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table.table}' ORDER BY ordinal_position`,
          targetDatabase
        );
        const targetColumns = parseLines(targetColumnOutput).map((line) => line.split('\t'))
          .filter(([, extra]) => !/GENERATED/i.test(extra ?? ''))
          .map(([column]) => column);
        const frozen = JSON.parse(fs.readFileSync(table.samplePath, 'utf8'));
        const projectedRows = [];
        for (const row of frozen.rows) {
          const matched = Number((await provisioner.query(
            buildSnapshotRowMatchSql({ table: table.table, row, targetColumns }), targetDatabase
          )).trim());
          if (!Number.isInteger(matched) || matched < 1) {
            throw new Error(`snapshot frozen row mismatch for ${table.role}.${table.table}`);
          }
          const columns = commonSnapshotColumns(row, targetColumns);
          projectedRows.push(Object.fromEntries(columns.map((column) => [column, row[column]])));
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
    async dropDatabase({ name, runKey }) {
      requireIdentifier(name, 'cleanup database');
      if (!name.includes(`_${runKey}_`) || Object.values(FORMAL_DATABASES).includes(name)) {
        throw new Error('cleanup database is outside the runKey boundary');
      }
      await provisioner.query(`DROP DATABASE IF EXISTS \`${name}\``);
    },
    async cleanupAccounts() {
      try {
        if (activeReservation) {
          const value = await redisClient.command(activeReservation.logicalDb, 'GET', 'terrapedia:automation:reservation');
          if (value === `${activeReservation.runKey}:${activeReservation.reservationToken}`) {
            await redisClient.command(activeReservation.logicalDb, 'FLUSHDB');
          }
          activeReservation = null;
        }
        if (accountsAttempted) {
          await bootstrap.query(`DROP USER IF EXISTS ${sqlString(accountNames.provisioner)}@'%', ${sqlString(accountNames.readonly)}@'%'`);
          const remaining = Number((await bootstrap.query(
            `SELECT COUNT(*) FROM mysql.user WHERE User IN (${sqlString(accountNames.provisioner)}, ${sqlString(accountNames.readonly)})`
          )).trim());
          if (remaining !== 0) throw new Error('temporary automation accounts still exist after cleanup');
          accountsCreated = false;
          accountsAttempted = false;
        }
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
    provisionerClient: provisioner
  };
  return Object.freeze(adapter);
}
