#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from './sync-maint-to-relation.mjs';
import { AUTOMATION_REDIS_DOMAIN_BINDINGS } from '../automation/automation-database-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRIMARY_ROOT = resolvePrimaryRoot(ROOT);
const mysql = createRequire(path.join(PRIMARY_ROOT, 'apps/admin-console/package.json'))('mysql2/promise');
const SETS_PATH = path.join(PRIMARY_ROOT, '.local/tmp/full-recrawl-20261013/armor/arm_20261013b/shared-data/generated/wiki-armor-sets.latest.json');
const IMAGES_PATH = path.join(PRIMARY_ROOT, '.local/tmp/full-recrawl-20261013/armor/arm_20261013b/shared-data/raw/wiki/armor_set_images.parsed.latest.json');
const STANDARDIZED_ITEMS_PATH = path.join(PRIMARY_ROOT, 'data/standardized/items.standardized.json');
const RUN_ROOT = path.join(PRIMARY_ROOT, '.local/tmp/full-recrawl-20261014/armor/arm_full_canonical_20261014');

function resolvePrimaryRoot(root) {
  const marker = `${path.sep}.worktrees${path.sep}`;
  const index = root.indexOf(marker);
  return index >= 0 ? root.slice(0, index) : root;
}

function readConfig(root) {
  return JSON.parse(fs.readFileSync(path.join(resolvePrimaryRoot(root), 'platform/local/config/local-stack.config.json'), 'utf8'));
}

function loadJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

function sqlColumns(row) { return Object.keys(row).filter((key) => /^[a-z0-9_]+$/i.test(key)); }

async function copyRows(source, target, sourceDatabase, targetDatabase, table, where, params) {
  const [rows] = await source.query(`SELECT * FROM \`${sourceDatabase}\`.\`${table}\` WHERE ${where}`, params);
  for (const row of rows) {
    const columns = sqlColumns(row);
    await target.query(`INSERT INTO \`${targetDatabase}\`.\`${table}\` (${columns.map((x) => `\`${x}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${columns.map((x) => `\`${x}\`=VALUES(\`${x}\`)`).join(', ')}`, columns.map((x) => row[x]));
  }
  return rows.length;
}

export async function readbackArmorBusinessTables(connection, maintConnection = connection) {
  const counts = {};
  for (const table of ['maint_armor_sets', 'maint_armor_set_images']) {
    const [[row]] = await maintConnection.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE deleted = 0`);
    counts[table] = Number(row.count);
  }
  for (const table of ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images', 'projection_armor_sets']) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE deleted = 0`);
    counts[table] = Number(row.count);
  }
  const rowHashes = {};
  const statements = [
    ['maint.maint_armor_sets', maintConnection, 'maint_armor_sets'],
    ['maint.maint_armor_set_images', maintConnection, 'maint_armor_set_images'],
    ['relation.relation_armor_sets', connection, 'relation_armor_sets'],
    ['relation.relation_armor_set_items', connection, 'relation_armor_set_items'],
    ['relation.relation_armor_set_images', connection, 'relation_armor_set_images'],
    ['relation.projection_armor_sets', connection, 'projection_armor_sets'],
  ];
  for (const [key, client, table] of statements) {
    const [rows] = await client.query(`SELECT * FROM \`${table}\` WHERE deleted = 0 ORDER BY id`);
    counts[key] = rows.length;
    rowHashes[key] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  return { counts, rowHashes };
}

export async function runArmorFullCanonicalIsolated({
  repoRoot = ROOT,
  runId = `armor-full-canonical-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
  runRoot = RUN_ROOT,
} = {}) {
  const config = readConfig(repoRoot);
  const setsPayload = loadJson(SETS_PATH);
  const imagePayload = loadJson(IMAGES_PATH);
  const standardizedItems = loadJson(STANDARDIZED_ITEMS_PATH).records;
  const armorSets = standardizedItems && Array.isArray(setsPayload.records) ? loadJson(path.join(PRIMARY_ROOT, 'data/standardized/armor_sets.standardized.json')).records : [];
  const requiredIds = [...new Set(armorSets.flatMap((record) => record.uniqueItemIds ?? []))].map(Number).filter(Number.isSafeInteger);
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-full-canonical-'));
  try {
    const result = await runLiveAutomationAcceptance({
      profile: 't1',
      runId,
      privateDirectory,
      mysql: {
        host: config.database.host,
        port: Number(config.database.port),
        username: process.env.TERRAPEDIA_DB_USERNAME ?? config.database.username,
        password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database.password,
      },
      redis: { host: config.redis.host, port: Number(config.redis.port), password: config.redis.password, logicalDb: AUTOMATION_REDIS_DOMAIN_BINDINGS.armor },
      scope: 'armor-canonical-isolated',
      acceptanceExecutor: async (context) => {
        const target = { host: context.mysql.host, port: context.mysql.port, user: context.mysql.username, password: context.mysql.password };
        const source = await mysql.createConnection({ host: context.mysql.host, port: context.mysql.port, user: context.mysql.readonlyUsername, password: context.mysql.readonlyPassword, database: 'terria_v1_local' });
        const local = await mysql.createConnection({ ...target, database: context.databases.local });
        const maint = await mysql.createConnection({ ...target, database: context.databases.maint });
        try {
          const placeholders = requiredIds.map(() => '?').join(', ');
          const copiedLocal = await copyRows(source, local, 'terria_v1_local', context.databases.local, 'items', `id IN (${placeholders})`, requiredIds);
          const copiedMaint = await copyRows(source, maint, 'terria_v1_maint', context.databases.maint, 'maint_items', `source_id IN (${placeholders})`, requiredIds);
          await local.end();
          await maint.end();
          await source.end();
          const sourceRevision = setsPayload.revisionTimestamp ?? setsPayload.sourceRevisionTimestamp ?? '2026-01-31T20:21:00Z';
          const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
          const landingRows = [
            { id: 920001, dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_kind: 'full_wiki_recrawl', source_key: 'armor-full-recrawl:sets', source_locator: 'Module:ArmorSetBonuses@964993', source_page: 'Module:ArmorSetBonuses', source_revision_timestamp: sourceRevision, content_hash: hash(armorSets), fetched_at: new Date().toISOString(), parsed_at: new Date().toISOString(), payload_json: JSON.stringify({ armorSets, sourceRevisionTimestamp: sourceRevision }), parse_status: 'ok', is_current: 1 },
            { id: 920002, dataset_type: 'armor_set_images_raw', provider: 'terraria.wiki.gg', source_kind: 'full_wiki_recrawl', source_key: 'armor-full-recrawl:images', source_locator: 'Armor set pages:imageinfo', source_page: 'Armor set pages', source_revision_timestamp: null, content_hash: hash(imagePayload.armorSetImages), fetched_at: imagePayload.fetchedAt, parsed_at: imagePayload.fetchedAt, payload_json: JSON.stringify({ armorSetImages: imagePayload.armorSetImages }), parse_status: 'ok', is_current: 1 },
          ];
          const runtimeConfig = { database: { host: context.mysql.host, port: context.mysql.port, username: context.mysql.username, password: context.mysql.password } };
          const maintSync = await runMaintSync({ apply: true, scopes: ['armor_sets', 'armor_set_images'], host: context.mysql.host, port: context.mysql.port, user: context.mysql.username, password: context.mysql.password, database: context.databases.maint }, { config: runtimeConfig, loadLandingRows: async () => landingRows, writeReport: async () => null });
          const relation = await runSync({ apply: true, createDatabase: false, scopes: ['armor_sets', 'armor_set_images'], maintDatabase: context.databases.maint, localDatabase: context.databases.local, relationDatabase: context.databases.relation, allowLocalItemImageFallback: false }, { config: runtimeConfig, writeReports: async () => ({ auditJsonPath: path.join(os.tmpdir(), 'armor-audit.json'), auditMdPath: path.join(os.tmpdir(), 'armor-audit.md'), conflictsPath: path.join(os.tmpdir(), 'armor-conflicts.json'), unresolvedPath: path.join(os.tmpdir(), 'armor-unresolved.json') }) });
          const relationConnection = await mysql.createConnection({ ...target, database: context.databases.relation });
          const maintReadbackConnection = await mysql.createConnection({ ...target, database: context.databases.maint });
          const counts = await readbackArmorBusinessTables(relationConnection, maintReadbackConnection);
          await relationConnection.end();
          await maintReadbackConnection.end();
          return { status: 'passed', formalDatabaseWrites: false, dependencySeed: { copiedLocal, copiedMaint }, maintSync, relationSummary: relation.summary ?? relation.results ?? null, readback: counts };
        } catch (error) {
          for (const connection of [source, local, maint]) { try { await connection.end(); } catch {} }
          throw error;
        }
      },
      onResources: async ({ redis }) => { if (Number(redis.logicalDb) !== AUTOMATION_REDIS_DOMAIN_BINDINGS.armor) throw new Error('Armor isolated run allocated the wrong Redis DB'); },
    });
    const artifact = {
      schemaVersion: 'armor-full-canonical-isolated/v1',
      status: result.status,
      runId,
      source: {
        sourceRun: 'arm_20261013b',
        sourceCounts: { moduleRecords: 64, armorSetRows: armorSets.length, imageRows: imagePayload.armorSetImages.length },
        dependencyItems: requiredIds.length,
      },
      redisLogicalDb: AUTOMATION_REDIS_DOMAIN_BINDINGS.armor,
      formalDatabaseWrites: false,
      databaseWritesToFormalRuntime: false,
      realIsolatedIngestion: result.acceptance,
      cleanup: { passed: result.cleanupPassed === true, acceptanceCleanupPassed: result.cleanupPassed === true },
      acceptance: result,
      cleanupPassed: result.cleanupPassed === true,
    };
    fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
    const outputPath = path.join(runRoot, 'isolated-real-ingestion.json');
    fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ outputPath, ...artifact });
  } finally { fs.rmSync(privateDirectory, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runArmorFullCanonicalIsolated().then((result) => { process.stdout.write(`${JSON.stringify({ status: result.status, outputPath: result.outputPath, cleanupPassed: result.cleanupPassed }, null, 2)}\n`); if (result.status !== 'passed' || result.cleanupPassed !== true) process.exitCode = 1; }).catch((error) => { process.stderr.write(`Armor full canonical isolated run failed: ${error.stack || error.message}\n`); process.exitCode = 1; });
}
