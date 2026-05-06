#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = {
  landingDatabase: 'terria_v1_maint',
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local',
  mode: 'quick',
  sampleLimit: 20,
  recentDays: 7,
};

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  const generatedAt = raw['generated-at'] ?? raw.generatedAt ?? null;

  return {
    landingDatabase: raw['landing-database'] ?? raw.landingDatabase ?? DEFAULTS.landingDatabase,
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    mode: normalizeMode(raw.mode),
    sampleLimit: positiveInteger(raw['sample-limit'] ?? raw.sampleLimit, DEFAULTS.sampleLimit),
    recentDays: positiveInteger(raw['recent-days'] ?? raw.recentDays, DEFAULTS.recentDays),
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, true),
    output: raw.output ?? null,
    generatedAt,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? generatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  };
}

export function buildCrossDbReferentialIntegrityQueries(options = {}) {
  const settings = {
    ...DEFAULTS,
    ...options,
    mode: normalizeMode(options.mode ?? DEFAULTS.mode),
    sampleLimit: positiveInteger(options.sampleLimit, DEFAULTS.sampleLimit),
    recentDays: positiveInteger(options.recentDays, DEFAULTS.recentDays),
  };

  const landingTable = table(settings.landingDatabase, 'source_dataset_landings');
  const relationItemFacts = table(settings.relationDatabase, 'item_source_facts');
  const relationShopRelations = table(settings.relationDatabase, 'item_npc_shop_relations');
  const relationLootRelations = table(settings.relationDatabase, 'item_npc_loot_relations');
  const localItems = table(settings.localDatabase, 'items');
  const localNpcs = table(settings.localDatabase, 'npcs');
  const localItemSources = table(settings.localDatabase, 'item_acquisition_sources');
  const localLoot = table(settings.localDatabase, 'npc_loot_entries');
  const localShop = table(settings.localDatabase, 'npc_shop_entries');
  const localShopConditions = table(settings.localDatabase, 'npc_shop_conditions');

  const landingWindow = currentLandingClause();

  return [
    check({
      id: 'maint_items_missing_current_landing',
      title: 'maint items missing current landing rows',
      expectation: { type: 'zero', field: 'count' },
      description: 'Each maint item must map back to a current landing evidence row.',
      sql: `SELECT COUNT(*) AS count
FROM ${table(settings.maintDatabase, 'maint_items')} m
LEFT JOIN ${landingTable} l
  ON l.id = m.landing_source_id
 ${landingWindow}
WHERE ${maintRecencyFilter('m', settings)}
  AND l.id IS NULL`,
    }),
    check({
      id: 'maint_npcs_missing_current_landing',
      title: 'maint npcs missing current landing rows',
      expectation: { type: 'zero', field: 'count' },
      description: 'Each maint NPC must map back to a current landing evidence row.',
      sql: `SELECT COUNT(*) AS count
FROM ${table(settings.maintDatabase, 'maint_npcs')} m
LEFT JOIN ${landingTable} l
  ON l.id = m.landing_source_id
 ${landingWindow}
WHERE ${maintRecencyFilter('m', settings)}
  AND l.id IS NULL`,
    }),
    check({
      id: 'maint_item_sources_missing_relation_facts',
      title: 'maint item sources missing relation facts',
      expectation: { type: 'zero', field: 'count' },
      description: 'Maint item source rows must materialize into relation item_source_facts.',
      sql: `SELECT COUNT(*) AS count
FROM ${table(settings.maintDatabase, 'maint_item_sources')} m
LEFT JOIN ${relationItemFacts} r
  ON r.source_maint_table = 'maint_item_sources'
 AND BINARY r.source_maint_record_key = BINARY m.record_key
WHERE ${maintRecencyFilter('m', settings)}
  AND r.record_key IS NULL`,
    }),
    check({
      id: 'relation_item_source_facts_missing_maint',
      title: 'relation item source facts missing maint rows',
      expectation: { type: 'zero', field: 'count' },
      description: 'Relation item_source_facts must remain traceable back to maint item sources.',
      sql: `SELECT COUNT(*) AS count
FROM ${relationItemFacts} r
LEFT JOIN ${table(settings.maintDatabase, 'maint_item_sources')} m
  ON r.source_maint_table = 'maint_item_sources'
 AND BINARY m.record_key = BINARY r.source_maint_record_key
WHERE ${relationRecencyFilter('r', settings)}
  AND (
    r.source_maint_table <> 'maint_item_sources'
    OR r.source_maint_record_key IS NULL
    OR m.record_key IS NULL
  )`,
    }),
    check({
      id: 'relation_shop_missing_local_entries',
      title: 'relation shop relations missing local shop entries',
      expectation: { type: 'warn_if_nonzero', field: 'count' },
      description: 'Resolved relation shop rows should have matching local compatibility output for the same item and NPC.',
      sql: `SELECT COUNT(*) AS count
FROM ${relationShopRelations} r
LEFT JOIN ${localItems} li
  ON li.deleted = 0
 AND li.source_id = r.item_source_id
LEFT JOIN ${localNpcs} ln
  ON ln.deleted = 0
 AND ln.source_id = r.npc_source_id
LEFT JOIN ${localShop} ls
  ON ls.deleted = 0
 AND ls.item_id = li.id
 AND ls.npc_id = ln.id
WHERE ${relationRecencyFilter('r', settings)}
  AND r.deleted = 0
  AND r.status = 1
  AND r.review_status IN ('accepted', 'resolved', 'promoted')
  AND ls.id IS NULL`,
    }),
    check({
      id: 'relation_loot_missing_local_entries',
      title: 'relation loot relations missing local loot entries',
      expectation: { type: 'warn_if_nonzero', field: 'count' },
      description: 'Resolved relation loot rows should have matching local compatibility output for the same item and NPC.',
      sql: `SELECT COUNT(*) AS count
FROM ${relationLootRelations} r
LEFT JOIN ${localItems} li
  ON li.deleted = 0
 AND li.source_id = r.item_source_id
LEFT JOIN ${localNpcs} ln
  ON ln.deleted = 0
 AND ln.source_id = r.npc_source_id
LEFT JOIN ${localLoot} ll
  ON ll.deleted = 0
 AND ll.item_id = li.id
 AND ll.npc_id = ln.id
WHERE ${relationRecencyFilter('r', settings)}
  AND r.deleted = 0
  AND r.status = 1
  AND r.review_status IN ('accepted', 'resolved', 'promoted')
  AND ll.id IS NULL`,
    }),
    check({
      id: 'local_item_source_rows_missing_relation_trace',
      title: 'local item acquisition rows without relation/maint trace',
      expectation: { type: 'warn_if_nonzero', field: 'count' },
      description: 'Local acquisition rows should remain traceable to relation facts or maint item sources using source metadata.',
      sql: `SELECT COUNT(*) AS count
FROM ${localItemSources} l
LEFT JOIN ${relationItemFacts} r
  ON r.deleted = 0
 AND (
      (r.item_source_id IS NOT NULL AND r.item_source_id = l.item_id)
      OR (r.source_provider IS NOT NULL AND r.source_provider = l.source_provider AND COALESCE(r.source_page, '') = COALESCE(l.source_page, ''))
 )
LEFT JOIN ${table(settings.maintDatabase, 'maint_item_sources')} m
  ON m.status = 1
 AND m.deleted = 0
 AND m.source_provider = l.source_provider
 AND COALESCE(m.source_page, '') = COALESCE(l.source_page, '')
WHERE ${localRecencyFilter('l', settings)}
  AND l.deleted = 0
  AND l.status = 1
  AND r.record_key IS NULL
  AND m.record_key IS NULL`,
    }),
    check({
      id: 'local_npc_loot_orphans',
      title: 'local npc loot rows with missing local item or npc',
      expectation: { type: 'zero', field: 'count' },
      description: 'Local compatibility loot rows must reference existing local item and NPC records.',
      sql: `SELECT COUNT(*) AS count
FROM ${localLoot} l
LEFT JOIN ${localItems} i
  ON i.id = l.item_id
 AND i.deleted = 0
LEFT JOIN ${localNpcs} n
  ON n.id = l.npc_id
 AND n.deleted = 0
WHERE ${localRecencyFilter('l', settings)}
  AND l.deleted = 0
  AND (i.id IS NULL OR n.id IS NULL)`,
    }),
    check({
      id: 'local_npc_shop_orphans',
      title: 'local npc shop rows with missing local item or npc',
      expectation: { type: 'zero', field: 'count' },
      description: 'Local compatibility shop rows must reference existing local item and NPC records.',
      sql: `SELECT COUNT(*) AS count
FROM ${localShop} l
LEFT JOIN ${localItems} i
  ON i.id = l.item_id
 AND i.deleted = 0
LEFT JOIN ${localNpcs} n
  ON n.id = l.npc_id
 AND n.deleted = 0
WHERE ${localRecencyFilter('l', settings)}
  AND l.deleted = 0
  AND (i.id IS NULL OR n.id IS NULL)`,
    }),
    check({
      id: 'local_npc_shop_conditions_orphans',
      title: 'local npc shop conditions with missing shop entry',
      expectation: { type: 'zero', field: 'count' },
      description: 'Shop condition rows must reference an existing local shop entry.',
      sql: `SELECT COUNT(*) AS count
FROM ${localShopConditions} c
LEFT JOIN ${localShop} s
  ON s.id = c.shop_entry_id
 AND s.deleted = 0
WHERE ${localRecencyFilter('c', settings)}
  AND c.deleted = 0
  AND s.id IS NULL`,
    }),
  ];
}

export function buildCrossDbReferentialIntegrityReport({
  generatedAt = new Date().toISOString(),
  mode = DEFAULTS.mode,
  databases = {},
  checks = [],
} = {}) {
  const normalizedChecks = checks.map((entry) => buildReportCheck(entry));
  const blockingCount = normalizedChecks.filter((check) => check.status === 'fail').length;
  const warningCount = normalizedChecks.filter((check) => check.status === 'warn').length;
  const passCount = normalizedChecks.filter((check) => check.status === 'pass').length;
  const infoCount = normalizedChecks.filter((check) => check.status === 'info').length;
  const missingCount = normalizedChecks.filter((check) => check.status === 'missing').length;

  return {
    generatedAt,
    mode: normalizeMode(mode),
    databases: {
      landingDatabase: databases.landingDatabase ?? DEFAULTS.landingDatabase,
      maintDatabase: databases.maintDatabase ?? DEFAULTS.maintDatabase,
      relationDatabase: databases.relationDatabase ?? DEFAULTS.relationDatabase,
      localDatabase: databases.localDatabase ?? DEFAULTS.localDatabase,
    },
    summary: {
      status: blockingCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'pass',
      checkCount: normalizedChecks.length,
      blockingCount,
      warningCount,
      passCount,
      infoCount,
      missingCount,
    },
    checks: normalizedChecks,
    blockingReasons: normalizedChecks.filter((check) => check.status === 'fail').map((check) => check.message),
    warningReasons: normalizedChecks.filter((check) => check.status === 'warn').map((check) => check.message),
  };
}

export async function runCrossDbReferentialIntegrityAudit(options = {}, dependencies = {}) {
  const normalized = {
    ...DEFAULTS,
    ...options,
    mode: normalizeMode(options.mode ?? DEFAULTS.mode),
    sampleLimit: positiveInteger(options.sampleLimit, DEFAULTS.sampleLimit),
    recentDays: positiveInteger(options.recentDays, DEFAULTS.recentDays),
    writeReport: options.writeReport ?? true,
    generatedAt: options.generatedAt ?? null,
    dateTag: options.dateTag ?? new Date().toISOString().slice(0, 10),
  };

  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
  };
  const createConnection = dependencies.createConnection ?? mysql.createConnection;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const connection = await createConnection(mysqlOptions);

  try {
    const definitions = buildCrossDbReferentialIntegrityQueries(normalized);
    const checks = [];
    for (const definition of definitions) {
      try {
        const [rows] = await connection.query(definition.sql);
        checks.push({ definition, rows });
      } catch (error) {
        checks.push({ definition, rows: [], error });
      }
    }

    const report = buildCrossDbReferentialIntegrityReport({
      generatedAt: normalized.generatedAt ?? `${normalized.dateTag}T00:00:00.000Z`,
      mode: normalized.mode,
      databases: normalized,
      checks,
    });
    const reportPaths = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPaths };
  } finally {
    await connection.end();
  }
}

function buildReportCheck({ definition, rows = [], error = null }) {
  if (error) {
    return {
      id: definition.id,
      title: definition.title,
      status: 'missing',
      message: `${definition.title}: ${error.message}`,
      expectation: definition.expectation,
      rows: [],
    };
  }

  const row = Array.isArray(rows) ? rows[0] ?? {} : {};
  const status = evaluateExpectation(definition.expectation, row);
  const countField = definition.expectation?.field ?? 'count';
  const countValue = Number(row?.[countField] ?? 0);
  return {
    id: definition.id,
    title: definition.title,
    status,
    message: formatCheckMessage(definition, status, countValue),
    expectation: definition.expectation,
    rows,
  };
}

function evaluateExpectation(expectation = {}, row = {}) {
  if (expectation.type === 'info') return 'info';
  const value = Number(row?.[expectation.field ?? 'count'] ?? 0);
  if (expectation.type === 'zero') {
    return value === 0 ? 'pass' : 'fail';
  }
  if (expectation.type === 'warn_if_nonzero') {
    return value === 0 ? 'pass' : 'warn';
  }
  return 'missing';
}

function formatCheckMessage(definition, status, value) {
  if (status === 'pass') return `${definition.title}: ${value}`;
  if (status === 'warn') return `${definition.title}: warning count=${value}`;
  if (status === 'fail') return `${definition.title}: blocking count=${value}`;
  if (status === 'info') return `${definition.title}: info`;
  return `${definition.title}: unavailable`;
}

async function defaultWriteReport(report, options) {
  const reportPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `cross-db-referential-integrity-${options.mode}-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return { jsonPath: reportPath };
}

function check(definition) {
  return definition;
}

function table(database, tableName) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`;
}

function quoteIdentifier(value) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error(`Invalid identifier: ${text}`);
  }
  return `\`${text}\``;
}

function currentLandingClause() {
  return 'AND l.is_current = 1 AND l.deleted = 0';
}

function maintRecencyFilter(alias, options) {
  if (normalizeMode(options.mode) === 'full') {
    return `${alias}.deleted = 0 AND ${alias}.status = 1`;
  }
  return `${alias}.deleted = 0 AND ${alias}.status = 1 AND ${alias}.updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${positiveInteger(options.recentDays, DEFAULTS.recentDays)} DAY)`;
}

function relationRecencyFilter(alias, options) {
  if (normalizeMode(options.mode) === 'full') {
    return `${alias}.deleted = 0`;
  }
  return `${alias}.deleted = 0 AND ${alias}.updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${positiveInteger(options.recentDays, DEFAULTS.recentDays)} DAY)`;
}

function localRecencyFilter(alias, options) {
  if (normalizeMode(options.mode) === 'full') {
    return '1 = 1';
  }
  return `${alias}.updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${positiveInteger(options.recentDays, DEFAULTS.recentDays)} DAY)`;
}

function normalizeMode(value) {
  return String(value ?? DEFAULTS.mode).trim().toLowerCase() === 'full' ? 'full' : 'quick';
}

function positiveInteger(value, fallback) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runCrossDbReferentialIntegrityAudit(options);
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}
