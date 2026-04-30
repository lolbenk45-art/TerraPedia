#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export function resolveMysqlRequirePath(root = repoRoot) {
  return path.join(root, 'data-query-app', 'package.json');
}

const require = createRequire(resolveMysqlRequirePath());
const mysql = require('mysql2/promise');

const DEFAULTS = {
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local'
};

function assertIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function table(database, tableName) {
  assertIdentifier(database, 'database');
  assertIdentifier(tableName, 'table');
  return `\`${database}\`.\`${tableName}\``;
}

function nonEmptyJson(columnName) {
  return `JSON_VALID(\`${columnName}\`) = 1
  AND CASE WHEN JSON_VALID(\`${columnName}\`) = 1 THEN JSON_TYPE(\`${columnName}\`) ELSE NULL END = 'ARRAY'
  AND CASE WHEN JSON_VALID(\`${columnName}\`) = 1 THEN JSON_LENGTH(\`${columnName}\`) ELSE 0 END > 0`;
}

function countCheck({ id, title, sql, expectation, description }) {
  return { id, title, sql, expectation, description };
}

export function buildRelationHealthQueries({
  maintDatabase = DEFAULTS.maintDatabase,
  relationDatabase = DEFAULTS.relationDatabase,
  localDatabase = DEFAULTS.localDatabase
} = {}) {
  const maintItemSources = table(maintDatabase, 'maint_item_sources');
  const maintBackfillCandidates = table(maintDatabase, 'maint_backfill_candidates');
  const itemSourceFacts = table(relationDatabase, 'item_source_facts');
  const shopRelations = table(relationDatabase, 'item_npc_shop_relations');
  const lootRelations = table(relationDatabase, 'item_npc_loot_relations');
  const relationAudits = table(relationDatabase, 'item_npc_relation_audits');
  const relationRuns = table(relationDatabase, 'relation_runs');
  const relationRunReports = table(relationDatabase, 'relation_run_reports');
  const projectionItems = table(relationDatabase, 'projection_items');
  const projectionNpcs = table(relationDatabase, 'projection_npcs');
  const projectionProjectiles = table(relationDatabase, 'projection_projectiles');
  const localCompatItemSources = table(localDatabase, 'item_acquisition_sources');
  const localCompatNpcLoot = table(localDatabase, 'npc_loot_entries');
  const localCompatNpcShop = table(localDatabase, 'npc_shop_entries');
  const localCompatNpcShopConditions = table(localDatabase, 'npc_shop_conditions');

  return [
    countCheck({
      id: 'maint_item_sources_vs_item_source_facts',
      title: 'maint_item_sources matches item_source_facts',
      expectation: { type: 'delta_zero', field: 'delta' },
      description: 'Canonical relation facts must stay row-for-row with maint item sources.',
      sql: `SELECT
  (SELECT COUNT(*) FROM ${maintItemSources}) AS maintCount,
  (SELECT COUNT(*) FROM ${itemSourceFacts}) AS relationCount,
  ((SELECT COUNT(*) FROM ${maintItemSources}) - (SELECT COUNT(*) FROM ${itemSourceFacts})) AS delta`
    }),
    countCheck({
      id: 'maint_item_sources_missing_in_relation',
      title: 'maint_item_sources keys missing from item_source_facts',
      expectation: { type: 'zero', field: 'count' },
      description: 'Every maint item source record_key must be present in relation item source facts.',
      sql: `SELECT COUNT(*) AS count
FROM ${maintItemSources} m
LEFT JOIN ${itemSourceFacts} f
  ON f.source_maint_table = 'maint_item_sources'
 AND BINARY f.source_maint_record_key = BINARY m.record_key
WHERE f.record_key IS NULL`
    }),
    countCheck({
      id: 'item_source_facts_missing_in_maint',
      title: 'item_source_facts keys missing from maint_item_sources',
      expectation: { type: 'zero', field: 'count' },
      description: 'Relation item source facts must remain traceable to maint item sources.',
      sql: `SELECT COUNT(*) AS count
FROM ${itemSourceFacts} f
LEFT JOIN ${maintItemSources} m
  ON BINARY m.record_key = BINARY f.source_maint_record_key
WHERE f.source_maint_table <> 'maint_item_sources'
   OR f.source_maint_record_key IS NULL
   OR m.record_key IS NULL`
    }),
    countCheck({
      id: 'maint_item_sources_by_type',
      title: 'maint_item_sources by source type',
      expectation: { type: 'info' },
      sql: `SELECT
  source_type AS sourceType,
  source_ref_type AS sourceRefType,
  COUNT(*) AS count
FROM ${maintItemSources}
GROUP BY source_type, source_ref_type
ORDER BY source_type, source_ref_type`
    }),
    countCheck({
      id: 'maint_backfill_candidates_open_count',
      title: 'maint-owned open backfill candidates',
      expectation: { type: 'info' },
      description: 'Backfill candidates are validated from maint only; relation sync must not write this table.',
      sql: `SELECT COUNT(*) AS count
FROM ${maintBackfillCandidates}
WHERE status = 'open'
  AND domain IN ('npc_item_relation', 'npc_projectile_relation', 'item_source_relation', 'boss_reward_relation')`
    }),
    countCheck({
      id: 'maint_backfill_candidates_breakdown',
      title: 'maint-owned backfill candidate breakdown',
      expectation: { type: 'info' },
      description: 'Maint remains the owner of crawler/backfill candidate queue state.',
      sql: `SELECT
  domain,
  missing_field AS missingField,
  recommended_action AS recommendedAction,
  status,
  COUNT(*) AS count
FROM ${maintBackfillCandidates}
GROUP BY domain, missing_field, recommended_action, status
ORDER BY domain, missing_field, recommended_action, status`
    }),
    countCheck({
      id: 'item_source_facts_by_type_review',
      title: 'item_source_facts by source type and review status',
      expectation: { type: 'info' },
      sql: `SELECT
  source_type AS sourceType,
  source_ref_type AS sourceRefType,
  review_status AS reviewStatus,
  COUNT(*) AS count
FROM ${itemSourceFacts}
GROUP BY source_type, source_ref_type, review_status
ORDER BY source_type, source_ref_type, review_status`
    }),
    countCheck({
      id: 'shop_relation_resolved_count',
      title: 'resolved shop relation count',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${shopRelations}
WHERE deleted = 0
  AND status = 1
  AND review_status IN ('accepted', 'resolved', 'promoted')`
    }),
    countCheck({
      id: 'loot_relation_resolved_count',
      title: 'resolved loot relation count',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${lootRelations}
WHERE deleted = 0
  AND status = 1
  AND review_status IN ('accepted', 'resolved', 'promoted')`
    }),
    countCheck({
      id: 'shop_relation_orphans',
      title: 'shop relations without source facts',
      expectation: { type: 'zero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${shopRelations} r
LEFT JOIN ${itemSourceFacts} f
  ON f.record_key = r.source_fact_key
WHERE f.record_key IS NULL`
    }),
    countCheck({
      id: 'loot_relation_orphans',
      title: 'loot relations without source facts',
      expectation: { type: 'zero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${lootRelations} r
LEFT JOIN ${itemSourceFacts} f
  ON f.record_key = r.source_fact_key
WHERE f.record_key IS NULL`
    }),
    countCheck({
      id: 'shop_relation_missing_resolution',
      title: 'shop relations missing item or NPC resolution',
      expectation: { type: 'zero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${shopRelations} r
WHERE r.item_internal_name IS NULL
   OR TRIM(r.item_internal_name) = ''
   OR r.npc_source_id IS NULL
   OR r.npc_internal_name IS NULL
   OR TRIM(r.npc_internal_name) = ''`
    }),
    countCheck({
      id: 'loot_relation_missing_resolution',
      title: 'loot relations missing item or NPC resolution',
      expectation: { type: 'zero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${lootRelations} r
WHERE r.item_internal_name IS NULL
   OR TRIM(r.item_internal_name) = ''
   OR r.npc_source_id IS NULL
   OR r.npc_internal_name IS NULL
   OR TRIM(r.npc_internal_name) = ''`
    }),
    countCheck({
      id: 'unresolved_item_npc_relation_audits',
      title: 'unresolved item/NPC relation audit issue count',
      expectation: { type: 'warn_if_nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${relationAudits}
WHERE audit_status IN ('unresolved', 'ambiguous', 'polluted', 'rejected')
   OR (reason_code IS NOT NULL AND audit_status <> 'resolved')`
    }),
    countCheck({
      id: 'item_npc_relation_audit_breakdown',
      title: 'item/NPC relation audit breakdown',
      expectation: { type: 'info' },
      sql: `SELECT
  audit_status AS auditStatus,
  reason_code AS reasonCode,
  COUNT(*) AS count
FROM ${relationAudits}
GROUP BY audit_status, reason_code
ORDER BY audit_status, reason_code`
    }),
    countCheck({
      id: 'relation_exportable_reports_latest',
      title: 'latest relation sync exportable report rows',
      expectation: { type: 'info' },
      description: 'Relation sync exports unresolved/candidate evidence through reports, not maint_backfill_candidates writes.',
      sql: `SELECT
  rr.report_kind AS reportKind,
  COUNT(*) AS count,
  MAX(rr.report_path) AS latestReportPath
FROM ${relationRunReports} rr
INNER JOIN ${relationRuns} r
  ON r.run_key = rr.run_key
WHERE r.id = (
  SELECT MAX(id)
  FROM ${relationRuns}
  WHERE status = 'succeeded'
)
  AND rr.report_kind IN ('audit_json', 'audit_md', 'conflicts_json', 'unresolved_json')
GROUP BY rr.report_kind
ORDER BY rr.report_kind`
    }),
    countCheck({
      id: 'relation_unresolved_export_report_count',
      title: 'latest relation unresolved export report count',
      expectation: { type: 'nonzero', field: 'count' },
      description: 'A latest successful relation run should have an unresolved JSON export, even when it contains zero rows.',
      sql: `SELECT COUNT(*) AS count
FROM ${relationRunReports} rr
INNER JOIN ${relationRuns} r
  ON r.run_key = rr.run_key
WHERE r.id = (
  SELECT MAX(id)
  FROM ${relationRuns}
  WHERE status = 'succeeded'
)
  AND rr.report_kind = 'unresolved_json'`
    }),
    countCheck({
      id: 'projection_items_source_npcs_nonempty',
      title: 'projection_items.source_npcs_json non-empty rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${projectionItems}
WHERE ${nonEmptyJson('source_npcs_json')}`
    }),
    countCheck({
      id: 'projection_npcs_loot_items_nonempty',
      title: 'projection_npcs.loot_items_json non-empty rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${projectionNpcs}
WHERE ${nonEmptyJson('loot_items_json')}`
    }),
    countCheck({
      id: 'projection_npcs_shop_items_nonempty',
      title: 'projection_npcs.shop_items_json non-empty rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${projectionNpcs}
WHERE ${nonEmptyJson('shop_items_json')}`
    }),
    countCheck({
      id: 'projection_npcs_source_items_nonempty',
      title: 'projection_npcs.source_items_json non-empty rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${projectionNpcs}
WHERE ${nonEmptyJson('source_items_json')}`
    }),
    countCheck({
      id: 'projection_projectiles_source_items_nonempty',
      title: 'projection_projectiles.source_items_json non-empty rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${projectionProjectiles}
WHERE ${nonEmptyJson('source_items_json')}`
    }),
    countCheck({
      id: 'projection_projectiles_source_npcs_nonempty',
      title: 'projection_projectiles.source_npcs_json non-empty rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count
FROM ${projectionProjectiles}
WHERE ${nonEmptyJson('source_npcs_json')}`
    }),
    countCheck({
      id: 'local_compat_item_acquisition_sources_count',
      title: 'local compatibility item_acquisition_sources rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count FROM ${localCompatItemSources}`
    }),
    countCheck({
      id: 'local_compat_npc_loot_entries_count',
      title: 'local compatibility npc_loot_entries rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count FROM ${localCompatNpcLoot}`
    }),
    countCheck({
      id: 'local_compat_npc_shop_entries_count',
      title: 'local compatibility npc_shop_entries rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count FROM ${localCompatNpcShop}`
    }),
    countCheck({
      id: 'local_compat_npc_shop_conditions_count',
      title: 'local compatibility npc_shop_conditions rows',
      expectation: { type: 'nonzero', field: 'count' },
      sql: `SELECT COUNT(*) AS count FROM ${localCompatNpcShopConditions}`
    })
  ];
}

function firstNumber(rows, field) {
  const value = rows?.[0]?.[field];
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function evaluateCheck(definition, rows, error = null) {
  if (error) {
    return {
      status: 'error',
      message: error.message
    };
  }

  const expectation = definition.expectation ?? { type: 'info' };
  if (expectation.type === 'info') {
    return { status: 'info', message: `${rows.length} row(s)` };
  }

  const value = firstNumber(rows, expectation.field);
  if (value == null) {
    return { status: 'error', message: `Expected numeric field ${expectation.field}` };
  }

  if (expectation.type === 'zero') {
    return value === 0
      ? { status: 'pass', message: 'count is 0' }
      : { status: 'fail', message: `expected 0, got ${value}` };
  }

  if (expectation.type === 'nonzero') {
    return value > 0
      ? { status: 'pass', message: `count is ${value}` }
      : { status: 'fail', message: 'expected count > 0, got 0' };
  }

  if (expectation.type === 'warn_if_nonzero') {
    return value > 0
      ? { status: 'warn', message: `count is ${value}` }
      : { status: 'pass', message: 'count is 0' };
  }

  if (expectation.type === 'delta_zero') {
    return value === 0
      ? { status: 'pass', message: 'delta is 0' }
      : { status: 'fail', message: `expected delta 0, got ${value}` };
  }

  return { status: 'info', message: `${rows.length} row(s)` };
}

export function buildRelationHealthReport({
  dateTag = new Date().toISOString().slice(0, 10),
  generatedAt = new Date().toISOString(),
  databases = DEFAULTS,
  checks = []
} = {}) {
  const normalizedChecks = checks.map(({ definition, rows = [], error = null }) => {
    const evaluation = evaluateCheck(definition, rows, error);
    return {
      id: definition.id,
      title: definition.title,
      status: evaluation.status,
      message: evaluation.message,
      description: definition.description ?? null,
      expectation: definition.expectation,
      sql: definition.sql,
      rows,
      error: error ? { message: error.message, code: error.code ?? null } : null
    };
  });

  const summary = {
    status: 'pass',
    totalChecks: normalizedChecks.length,
    blockingCount: normalizedChecks.filter((check) => ['fail', 'error'].includes(check.status)).length,
    warningCount: normalizedChecks.filter((check) => check.status === 'warn').length,
    passCount: normalizedChecks.filter((check) => check.status === 'pass').length,
    infoCount: normalizedChecks.filter((check) => check.status === 'info').length
  };
  if (summary.blockingCount > 0) summary.status = 'blocked';
  else if (summary.warningCount > 0) summary.status = 'warning';

  return {
    generatedAt,
    dateTag,
    databases,
    summary,
    checks: normalizedChecks
  };
}

export function formatValidationChecklist({
  maintDatabase = DEFAULTS.maintDatabase,
  relationDatabase = DEFAULTS.relationDatabase,
  localDatabase = DEFAULTS.localDatabase
} = {}) {
  return `# NPC/Item Relation Serial Validation Checklist

Guardrails:
- Do not run two DB apply scripts in parallel.
- Do not run crawler/maint apply while relation apply is running.
- Review each dry-run output before the matching apply command.
- maint_backfill_candidates remains maint-owned; validate it from ${maintDatabase}, but do not have relation sync write it.
- Relation validation covers item_npc_relation_audits and relation report exports for unresolved/exportable candidates.
- Local compatibility validation targets sync-relation-to-local-compat-tables.mjs outputs only: item_acquisition_sources, npc_loot_entries, npc_shop_entries, npc_shop_conditions.

1. Start local stack.

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\start-local-stack.ps1
\`\`\`

2. Generate or refresh the NPC item relation bundle.

\`\`\`powershell
node scripts/data/fetch/build-npc-item-relations-bundle.mjs --output=data/generated/npc-item-relations.bundle.json
\`\`\`

3. Maint dry-run.

\`\`\`powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=${maintDatabase} --scopes=npcs
\`\`\`

4. Maint apply after dry-run review.

\`\`\`powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=${maintDatabase} --scopes=npcs
\`\`\`

5. Relation dry-run.

\`\`\`powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=${maintDatabase} --local-database=${localDatabase} --relation-database=${relationDatabase}
\`\`\`

6. Inspect item_npc_relation_audits and relation report exports under reports/relation for unresolved/exportable candidates.

7. Relation apply.

\`\`\`powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=${maintDatabase} --local-database=${localDatabase} --relation-database=${relationDatabase}
\`\`\`

8. Projection/local core dry-run.

\`\`\`powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=${localDatabase} --relation-database=${relationDatabase} --domains=items,npcs,projectiles
\`\`\`

9. Projection/local core apply.

\`\`\`powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=${localDatabase} --relation-database=${relationDatabase} --domains=items,npcs,projectiles
\`\`\`

10. Local compatibility relation dry-run.

\`\`\`powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=${localDatabase} --relation-database=${relationDatabase}
\`\`\`

11. Local compatibility relation apply.

\`\`\`powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=${localDatabase} --relation-database=${relationDatabase}
\`\`\`

12. Relation health report.

\`\`\`powershell
node scripts/data/relation/relation-health-report.mjs --maint-database=${maintDatabase} --relation-database=${relationDatabase} --local-database=${localDatabase}
\`\`\`

13. Replacement readiness audit.

\`\`\`powershell
node scripts/data/relation/replacement-readiness-audit.mjs --local-database=${localDatabase} --relation-database=${relationDatabase}
\`\`\`
`;
}

function formatSqlMarkdown(queries) {
  const lines = ['# Relation Health SQL', ''];
  for (const query of queries) {
    lines.push(`## ${query.id}`);
    lines.push('');
    lines.push(query.title);
    lines.push('');
    lines.push('```sql');
    lines.push(`${query.sql};`);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

function formatReportMarkdown(report) {
  const lines = [
    '# Relation Health Report',
    '',
    `Generated At: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Blocking Checks: ${report.summary.blockingCount}`,
    `Warning Checks: ${report.summary.warningCount}`,
    '',
    '| Check | Status | Message |',
    '| --- | --- | --- |'
  ];

  for (const check of report.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${String(check.message).replaceAll('|', '\\|')} |`);
  }

  return `${lines.join('\n')}\n`;
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, `relation-health-${report.dateTag}.json`);
  const mdPath = path.join(reportsDir, `relation-health-${report.dateTag}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, formatReportMarkdown(report));
  return { jsonPath, mdPath };
}

export async function runRelationHealthReport(options = {}, dependencies = {}) {
  const normalized = {
    ...DEFAULTS,
    dateTag: new Date().toISOString().slice(0, 10),
    writeReport: true,
    ...options
  };
  const queries = buildRelationHealthQueries(normalized);
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };
  const createConnection = dependencies.createConnection ?? mysql.createConnection;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const connection = await createConnection(mysqlOptions);

  try {
    const checks = [];
    for (const definition of queries) {
      try {
        const [rows] = await connection.query(definition.sql);
        checks.push({ definition, rows });
      } catch (error) {
        checks.push({ definition, rows: [], error });
      }
    }

    const report = buildRelationHealthReport({
      dateTag: normalized.dateTag,
      databases: {
        maintDatabase: normalized.maintDatabase,
        relationDatabase: normalized.relationDatabase,
        localDatabase: normalized.localDatabase
      },
      checks
    });
    const reportPaths = normalized.writeReport ? await writeReport(report) : null;
    return { report, reportPaths };
  } finally {
    await connection.end();
  }
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, true),
    printSql: booleanOption(raw['print-sql'] ?? raw.printSql, false),
    printChecklist: booleanOption(raw['print-checklist'] ?? raw.printChecklist, false)
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  if (options.printChecklist) {
    console.log(formatValidationChecklist(options));
  }
  if (options.printSql) {
    console.log(formatSqlMarkdown(buildRelationHealthQueries(options)));
  }
  if (!options.printChecklist && !options.printSql) {
    const result = await runRelationHealthReport({
      ...options,
      dateTag: options.dateTag ?? new Date().toISOString().slice(0, 10)
    });
    console.log(`Relation health status: ${result.report.summary.status}`);
    console.log(`Blocking checks: ${result.report.summary.blockingCount}`);
    console.log(`Warning checks: ${result.report.summary.warningCount}`);
    if (result.reportPaths) {
      console.log(`Relation health report: ${result.reportPaths.jsonPath}`);
    }
  }
}
