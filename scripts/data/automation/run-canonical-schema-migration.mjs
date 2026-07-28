#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { buildMaintSchemaSql } from '../maint/maint-schema.mjs';
import {
  NPC_CRAWLER_FACT_RELATION_TARGETS,
  buildRelationSchemaSql,
} from '../relation/relation-schema.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';

const OPERATION_ID = 'canonical-schema-v56-v58';

export async function runCanonicalSchemaMigrationCli({
  repoRoot = process.cwd(),
  argv = process.argv.slice(2),
  env = process.env,
  spawnImpl = spawnCommand,
  applyRoleSchemasImpl = applyCanonicalRoleSchemas,
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
  now = new Date().toISOString(),
} = {}) {
  const args = parseArgs(argv);
  if (args.apply !== 'true') throw new Error('--apply=true is required for canonical schema migration');
  loadAuthorizationContextImpl({ env, operationId: OPERATION_ID, now });
  const outputPath = path.resolve(requireText(args.output, '--output'));
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') {
    throw new Error('TERRAPEDIA_DB_NAME must be exactly terria_v1_local');
  }
  requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST');
  requirePort(env.TERRAPEDIA_DB_PORT);
  requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME');
  requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD');
  if (typeof spawnImpl !== 'function') throw new TypeError('spawn implementation is required');

  const result = await spawnImpl('mvn', [
    '-q',
    '-DskipTests',
    '-Dexec.mainClass=com.terraria.skills.tooling.CanonicalFlywayMigrationCli',
    'org.codehaus.mojo:exec-maven-plugin:3.2.0:java',
  ], {
    cwd: path.join(path.resolve(repoRoot), 'back'),
    shell: false,
    env: { ...env, TERRAPEDIA_SCHEMA_OPERATION_ID: OPERATION_ID },
  });
  if (Number(result?.exitCode) !== 0) {
    throw new Error(`canonical Flyway migration failed: ${String(result?.stderr ?? '').trim() || `exit ${result?.exitCode ?? 'unknown'}`}`);
  }
  const flywayReport = parseReport(result?.stdout);
  if (flywayReport.operationId !== OPERATION_ID || flywayReport.status !== 'completed'
      || flywayReport.currentVersion !== '58') {
    throw new Error('canonical Flyway migration returned an invalid result');
  }
  const roleSchemas = await applyRoleSchemasImpl({ repoRoot: path.resolve(repoRoot), env });
  const report = { ...flywayReport, roleSchemas };
  writeJsonAtomic(outputPath, report);
  return report;
}

export async function applyCanonicalRoleSchemas({
  repoRoot = process.cwd(),
  env = process.env,
  mysqlModule = null,
} = {}) {
  const mysql = mysqlModule ?? loadMysqlModule();
  const base = {
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: requirePort(env.TERRAPEDIA_DB_PORT),
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    multipleStatements: true,
  };
  const v56Path = path.join(
    path.resolve(repoRoot),
    'back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql',
  );
  const v56Sql = fs.readFileSync(v56Path, 'utf8');
  const maint = await applyMaintRoleSchema({ mysql, base, v56Sql });
  const relation = await applyRelationRoleSchema({ mysql, base });
  return { maint, relation };
}

async function applyMaintRoleSchema({ mysql, base, v56Sql }) {
  const database = 'terria_v1_maint';
  const connection = await mysql.createConnection({ ...base, database });
  try {
    const requiredColumns = [
      'artifact_role', 'producer_id', 'producer_version', 'producer_run_key',
      'bootstrap_manifest_hash', 'full_file_content_hash', 'full_file_byte_size', 'current_slot',
    ];
    const [columnRows] = await connection.query(
      'SELECT column_name FROM information_schema.columns'
      + ' WHERE table_schema = ? AND table_name = ? AND column_name IN (?)',
      [database, 'source_dataset_landings', requiredColumns],
    );
    const present = new Set((columnRows ?? []).map((row) => row.column_name ?? row.COLUMN_NAME));
    if (present.size !== 0 && present.size !== requiredColumns.length) {
      throw new Error('maint V56 landing schema is partially applied');
    }
    let v56Applied = false;
    if (present.size === 0) {
      await connection.query(v56Sql);
      v56Applied = true;
    }
    await connection.query(buildMaintSchemaSql());
    const tables = [
      'maint_npc_crawler_facts', 'maint_item_groups', 'maint_item_group_members',
      'maint_item_group_aliases', 'maint_item_group_member_exclusions',
    ];
    await requireTables(connection, database, tables);
    return { database, v56Applied, requiredTableCount: tables.length, applied: true };
  } finally {
    await connection.end();
  }
}

async function applyRelationRoleSchema({ mysql, base }) {
  const database = 'terria_v1_relation';
  const connection = await mysql.createConnection({ ...base, database });
  try {
    await connection.query(buildRelationSchemaSql());
    const tables = [
      'relation_item_groups', 'relation_item_group_members', 'relation_item_group_aliases',
      ...NPC_CRAWLER_FACT_RELATION_TARGETS,
    ];
    await requireTables(connection, database, [...new Set(tables)]);
    return { database, requiredTableCount: new Set(tables).size, applied: true };
  } finally {
    await connection.end();
  }
}

async function requireTables(connection, database, tables) {
  const [rows] = await connection.query(
    'SELECT table_name FROM information_schema.tables'
    + ' WHERE table_schema = ? AND table_name IN (?)',
    [database, tables],
  );
  const present = new Set((rows ?? []).map((row) => row.table_name ?? row.TABLE_NAME));
  const missing = tables.filter((table) => !present.has(table));
  if (missing.length) throw new Error(`${database} canonical schema tables are missing: ${missing.join(', ')}`);
}

function spawnCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
  });
}

function parseReport(stdout) {
  const lines = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {
      // Maven may emit non-JSON setup lines before the CLI result.
    }
  }
  throw new Error('canonical Flyway migration did not emit a JSON result');
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requirePort(value) {
  const port = Number(requireText(value, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCanonicalSchemaMigrationCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`canonical schema migration failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
