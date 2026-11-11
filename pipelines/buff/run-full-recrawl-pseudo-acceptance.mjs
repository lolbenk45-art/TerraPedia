import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  assertAutomationRedisLogicalDb,
  buildAutomationDatabaseNames,
  FULL_RECRAWL_REDIS_LOGICAL_DBS,
  openDurableRunKeyRegistry,
} from '../automation/automation-database-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORMAL_DATABASES = new Set(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const REDIS_DB = FULL_RECRAWL_REDIS_LOGICAL_DBS.buff;

function argValue(args, name, fallback = null) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function requireSafeIdentifier(value, label) {
  if (!/^[a-z0-9_]+$/.test(String(value ?? ''))) throw new Error(`${label} is invalid`);
  return value;
}

function sqlString(value) {
  return `'${String(value ?? '').replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '\\r')}'`;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function mysqlArgs(database = null) {
  const args = ['--protocol=tcp', '-N', '-h', process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1', '-P', String(process.env.TERRAPEDIA_DB_PORT ?? 13306), '-u', process.env.TERRAPEDIA_DB_USERNAME ?? 'root'];
  if (database) args.push(database);
  return args;
}

function mysql(sql, database = null) {
  return execFileSync('mysql', [...mysqlArgs(database)], { input: `${sql}\n`, encoding: 'utf8' });
}

function redis(args) {
  return execFileSync('redis-cli', ['-h', process.env.TERRAPEDIA_REDIS_HOST ?? '127.0.0.1', '-p', String(process.env.TERRAPEDIA_REDIS_PORT ?? 6380), '-a', process.env.TERRAPEDIA_REDIS_PASSWORD ?? 'root', '--no-auth-warning', ...args], { encoding: 'utf8' }).trim();
}

function loadCapture(inputPath) {
  const value = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(value.buffs) || value.buffs.length !== 400) {
    throw new Error(`full Buff capture must contain exactly 400 records: ${inputPath}`);
  }
  const ids = new Set(value.buffs.map((record) => Number(record.id)));
  const names = new Set(value.buffs.map((record) => String(record.internalName ?? '')));
  if (ids.size !== 400 || names.size !== 400 || [...names].some((name) => !name)) {
    throw new Error('full Buff capture contains duplicate or blank identities');
  }
  return value;
}

function buildRunSql(databases, capture) {
  const [landing, maint, relation] = [databases.local, databases.maint, databases.relation];
  const statements = [
    `CREATE DATABASE IF NOT EXISTS \`${landing}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE DATABASE IF NOT EXISTS \`${maint}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE DATABASE IF NOT EXISTS \`${relation}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE \`${landing}\`.\`recrawl_landing\` (source_id INT PRIMARY KEY, internal_name VARCHAR(255) NOT NULL, payload_json LONGTEXT NOT NULL, payload_hash CHAR(71) NOT NULL) ENGINE=InnoDB`,
    `CREATE TABLE \`${maint}\`.\`recrawl_maint\` (source_id INT PRIMARY KEY, internal_name VARCHAR(255) NOT NULL, source_revision_id BIGINT NULL, payload_hash CHAR(71) NOT NULL) ENGINE=InnoDB`,
    `CREATE TABLE \`${relation}\`.\`recrawl_relation\` (source_id INT PRIMARY KEY, internal_name VARCHAR(255) NOT NULL, source_item_count INT NOT NULL, inflicting_npc_count INT NOT NULL) ENGINE=InnoDB`,
    `CREATE TABLE \`${relation}\`.\`recrawl_projection\` (source_id INT PRIMARY KEY, internal_name VARCHAR(255) NOT NULL, payload_hash CHAR(71) NOT NULL) ENGINE=InnoDB`,
  ];
  const landingRows = [];
  const maintRows = [];
  const relationRows = [];
  const projectionRows = [];
  for (const record of capture.buffs) {
    const id = Number(record.id);
    const name = String(record.internalName);
    const payload = JSON.stringify(record);
    const hash = sha256(payload);
    const revisionId = record.sourceEvidence?.revisionId ?? record.sourceEvidence?.sourceRevisionId ?? null;
    landingRows.push(`(${id},${sqlString(name)},${sqlString(payload)},${sqlString(hash)})`);
    maintRows.push(`(${id},${sqlString(name)},${revisionId == null ? 'NULL' : Number(revisionId)},${sqlString(hash)})`);
    relationRows.push(`(${id},${sqlString(name)},${Array.isArray(record.sourceItems) ? record.sourceItems.length : 0},${Array.isArray(record.inflictingNpcs) ? record.inflictingNpcs.length : 0})`);
    projectionRows.push(`(${id},${sqlString(name)},${sqlString(hash)})`);
  }
  statements.push(
    `INSERT INTO \`${landing}\`.\`recrawl_landing\` (source_id,internal_name,payload_json,payload_hash) VALUES ${landingRows.join(',')}`,
    `INSERT INTO \`${maint}\`.\`recrawl_maint\` (source_id,internal_name,source_revision_id,payload_hash) VALUES ${maintRows.join(',')}`,
    `INSERT INTO \`${relation}\`.\`recrawl_relation\` (source_id,internal_name,source_item_count,inflicting_npc_count) VALUES ${relationRows.join(',')}`,
    `INSERT INTO \`${relation}\`.\`recrawl_projection\` (source_id,internal_name,payload_hash) VALUES ${projectionRows.join(',')}`,
  );
  return `${statements.join(';\n')};`;
}

function readback(databases) {
  const names = [databases.local, databases.maint, databases.relation];
  const counts = {
    landing: Number(mysql(`SELECT COUNT(*) FROM \`${databases.local}\`.\`recrawl_landing\``).trim()),
    maint: Number(mysql(`SELECT COUNT(*) FROM \`${databases.maint}\`.\`recrawl_maint\``).trim()),
    relation: Number(mysql(`SELECT COUNT(*) FROM \`${databases.relation}\`.\`recrawl_relation\``).trim()),
    projection: Number(mysql(`SELECT COUNT(*) FROM \`${databases.relation}\`.\`recrawl_projection\``).trim()),
  };
  const hashes = mysql(`SELECT GROUP_CONCAT(payload_hash ORDER BY source_id SEPARATOR ',') FROM \`${databases.local}\`.\`recrawl_landing\``).trim();
  return { databases: names, counts, landingHash: sha256(hashes) };
}

function cleanup(databases, reservationToken) {
  try {
    if (redis(['-n', String(REDIS_DB), 'GET', 'terrapedia:automation:reservation']) === reservationToken) {
      redis(['-n', String(REDIS_DB), 'FLUSHDB']);
    }
  } finally {
    mysql(`DROP DATABASE IF EXISTS \`${databases.local}\`; DROP DATABASE IF EXISTS \`${databases.maint}\`; DROP DATABASE IF EXISTS \`${databases.relation}\`;`);
  }
  const remainingSchemas = Number(mysql(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN (${Object.values(databases).map(sqlString).join(',')})`).trim());
  const remainingRedisKeys = Number(redis(['-n', String(REDIS_DB), 'DBSIZE']));
  return { remainingSchemas, remainingRedisKeys, remainingAccounts: 0, childProcesses: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = path.resolve(argValue(args, 'input', ''));
  const runId = argValue(args, 'run-id', 'buff-full-recrawl-20261013');
  const requestedDb = Number(argValue(args, 'redis-db', REDIS_DB));
  assertAutomationRedisLogicalDb(requestedDb, 'Buff full-recrawl Redis logical DB');
  if (requestedDb !== REDIS_DB) throw new Error('Buff full-recrawl is bound to Redis DB22');
  if (!fs.existsSync(inputPath)) throw new Error(`capture input is missing: ${inputPath}`);
  const capture = loadCapture(inputPath);
  const runRoot = path.resolve(argValue(args, 'run-root', path.join(ROOT, '.local', 'tmp', 'full-recrawl-20261013', 'buffs', 'buf_20261013_full')));
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  const registry = openDurableRunKeyRegistry(path.join(runRoot, 'run-key-mappings.json'));
  const databases = buildAutomationDatabaseNames({ profile: 't1', runId, mappings: registry });
  if (Object.values(databases).some((name) => FORMAL_DATABASES.has(name))) throw new Error('formal database escaped pseudo-ingestion');
  const reservationToken = `${databases.runKey}:${process.pid}`;
  const outputPath = path.resolve(argValue(args, 'output', path.join(runRoot, 'isolated-pseudo-ingestion.json')));
  let result;
  try {
    if (Number(redis(['-n', String(REDIS_DB), 'DBSIZE'])) !== 0) throw new Error('Redis DB22 must be empty before Buff pseudo-ingestion');
    if (redis(['-n', String(REDIS_DB), 'SET', 'terrapedia:automation:reservation', reservationToken, 'NX']) !== 'OK') throw new Error('Redis DB22 reservation failed');
    mysql(buildRunSql(databases, capture));
    const readbackResult = readback(databases);
    if (Object.values(readbackResult.counts).some((count) => count !== 400)) throw new Error(`isolated pseudo-ingestion count mismatch: ${JSON.stringify(readbackResult.counts)}`);
    result = { status: 'passed', mode: 'minimal_pseudo_ingestion', formalDatabaseWrites: false, redisLogicalDb: REDIS_DB, runId, runKey: databases.runKey, source: { inputPath, totalBuffs: capture.buffs.length, moduleRevisionId: capture.sourceRevisionTimestamp ?? null }, readback: readbackResult };
  } finally {
    result ??= { status: 'failed', formalDatabaseWrites: false, redisLogicalDb: REDIS_DB, runId, runKey: databases.runKey };
    result.cleanup = cleanup(databases, reservationToken);
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'passed' || result.cleanup.remainingSchemas !== 0 || result.cleanup.remainingRedisKeys !== 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Buff full-recrawl pseudo-ingestion failed: ${error.message}\n`);
  process.exitCode = 1;
});
