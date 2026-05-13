import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelationHealthQueries,
  buildRelationHealthReport,
  formatValidationChecklist,
  parseArgs,
  resolveMysqlRequirePath
} from './relation-health-report.mjs';

test('parseArgs defaults to read-only relation health validation databases', () => {
  assert.deepEqual(parseArgs([]), {
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
    dateTag: null,
    writeReport: true,
    printSql: false,
    printChecklist: false
  });
});

test('buildRelationHealthQueries emits only SELECT checks for NPC item relation acceptance', () => {
  const queries = buildRelationHealthQueries({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local'
  });

  assert.ok(queries.length >= 15);
  assert.ok(queries.every((query) => query.sql.trimStart().toUpperCase().startsWith('SELECT')));
  assert.ok(queries.every((query) => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE)\b/i.test(query.sql)));

  const byId = new Map(queries.map((query) => [query.id, query.sql]));
  assert.match(byId.get('maint_item_sources_vs_item_source_facts'), /`terria_v1_maint`\.`maint_item_sources`/);
  assert.match(byId.get('maint_item_sources_vs_item_source_facts'), /`terria_v1_relation`\.`item_source_facts`/);
  assert.match(byId.get('shop_relation_orphans'), /`item_npc_shop_relations`/);
  assert.match(byId.get('loot_relation_orphans'), /`item_npc_loot_relations`/);
  assert.match(byId.get('unresolved_item_npc_relation_audits'), /`item_npc_relation_audits`/);
  assert.match(byId.get('maint_backfill_candidates_open_count'), /`terria_v1_maint`\.`maint_backfill_candidates`/);
  assert.match(byId.get('relation_exportable_reports_latest'), /`terria_v1_relation`\.`relation_run_reports`/);
  assert.match(byId.get('projection_items_source_npcs_nonempty'), /`projection_items`/);
  assert.match(byId.get('projection_npcs_shop_items_nonempty'), /`shop_items_json`/);
  assert.match(byId.get('projection_projectiles_source_npcs_nonempty'), /`projection_projectiles`/);
  assert.match(byId.get('local_compat_npc_shop_conditions_count'), /`terria_v1_local`\.`npc_shop_conditions`/);
  assert.match(byId.get('local_compat_npc_shop_conditions_count'), /`terria_v1_relation`\.`item_npc_shop_relations`/);
});

test('buildRelationHealthQueries keeps local validation scoped to standalone compatibility outputs', () => {
  const queries = buildRelationHealthQueries();
  const allSql = queries.map((query) => query.sql).join('\n\n');

  assert.doesNotMatch(allSql, /`terria_v1_local`\.`items`/);
  assert.doesNotMatch(allSql, /`terria_v1_local`\.`npcs`/);
  assert.match(allSql, /`terria_v1_local`\.`item_acquisition_sources`/);
  assert.match(allSql, /`terria_v1_local`\.`npc_loot_entries`/);
  assert.match(allSql, /`terria_v1_local`\.`npc_shop_entries`/);
  assert.match(allSql, /`terria_v1_local`\.`npc_shop_conditions`/);
});

test('buildRelationHealthQueries checks maint item source key parity in both directions', () => {
  const queries = buildRelationHealthQueries({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation'
  });
  const byId = new Map(queries.map((query) => [query.id, query]));

  const maintMissing = byId.get('maint_item_sources_missing_in_relation');
  const relationMissing = byId.get('item_source_facts_missing_in_maint');

  assert.ok(maintMissing);
  assert.ok(relationMissing);
  assert.deepEqual(maintMissing.expectation, { type: 'zero', field: 'count' });
  assert.deepEqual(relationMissing.expectation, { type: 'zero', field: 'count' });
  assert.match(maintMissing.sql, /FROM `terria_v1_maint`\.`maint_item_sources` m/);
  assert.match(maintMissing.sql, /LEFT JOIN `terria_v1_relation`\.`item_source_facts` f/);
  assert.match(maintMissing.sql, /f\.source_maint_table = 'maint_item_sources'/);
  assert.match(maintMissing.sql, /BINARY f\.source_maint_record_key = BINARY m\.record_key/);
  assert.match(maintMissing.sql, /m\.status\s*=\s*1/);
  assert.match(maintMissing.sql, /m\.deleted\s*=\s*0/);
  assert.match(relationMissing.sql, /FROM `terria_v1_relation`\.`item_source_facts` f/);
  assert.match(relationMissing.sql, /LEFT JOIN `terria_v1_maint`\.`maint_item_sources` m/);
  assert.match(relationMissing.sql, /BINARY m\.record_key = BINARY f\.source_maint_record_key/);
  assert.match(relationMissing.sql, /f\.source_maint_table <> 'maint_item_sources'/);
  assert.match(relationMissing.sql, /m\.status\s*=\s*1/);
  assert.match(relationMissing.sql, /m\.deleted\s*=\s*0/);
});

test('buildRelationHealthQueries requires projection JSON columns to be valid non-empty arrays', () => {
  const queries = buildRelationHealthQueries();
  const byId = new Map(queries.map((query) => [query.id, query.sql]));

  for (const [id, columnName] of [
    ['projection_items_source_npcs_nonempty', 'source_npcs_json'],
    ['projection_npcs_loot_items_nonempty', 'loot_items_json'],
    ['projection_npcs_shop_items_nonempty', 'shop_items_json'],
    ['projection_npcs_source_items_nonempty', 'source_items_json']
  ]) {
    const sql = byId.get(id);
    assert.ok(sql, id);
    assert.match(sql, new RegExp('JSON_VALID\\(`' + columnName + '`\\) = 1'));
    assert.match(sql, new RegExp('CASE WHEN JSON_VALID\\(`' + columnName + '`\\) = 1 THEN JSON_TYPE\\(`' + columnName + '`\\) ELSE NULL END = \'ARRAY\''));
    assert.match(sql, new RegExp('CASE WHEN JSON_VALID\\(`' + columnName + '`\\) = 1 THEN JSON_LENGTH\\(`' + columnName + '`\\) ELSE 0 END > 0'));
  }
});

test('buildRelationHealthQueries makes standalone local compatibility counts blocking', () => {
  const queries = buildRelationHealthQueries();
  const byId = new Map(queries.map((query) => [query.id, query]));

  for (const id of [
    'local_compat_item_acquisition_sources_count',
    'local_compat_npc_loot_entries_count',
    'local_compat_npc_shop_entries_count'
  ]) {
    assert.deepEqual(byId.get(id)?.expectation, { type: 'nonzero', field: 'count' }, id);
  }
  assert.deepEqual(byId.get('local_compat_npc_shop_conditions_count')?.expectation, {
    type: 'delta_zero',
    field: 'delta'
  });
});

test('buildRelationHealthReport classifies blocking, warning, passing, and info checks', () => {
  const queries = buildRelationHealthQueries({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local'
  });
  const queryMap = new Map(queries.map((query) => [query.id, query]));

  const report = buildRelationHealthReport({
    dateTag: '2026-04-29',
    checks: [
      {
        definition: queryMap.get('maint_item_sources_vs_item_source_facts'),
        rows: [{ maintCount: 3187, relationCount: 3186, delta: 1 }]
      },
      {
        definition: queryMap.get('shop_relation_orphans'),
        rows: [{ count: 0 }]
      },
      {
        definition: queryMap.get('projection_items_source_npcs_nonempty'),
        rows: [{ count: 12 }]
      },
      {
        definition: queryMap.get('projection_npcs_shop_items_nonempty'),
        rows: [{ count: 0 }]
      },
      {
        definition: queryMap.get('unresolved_item_npc_relation_audits'),
        rows: [{ count: 4 }]
      },
      {
        definition: queryMap.get('local_compat_item_acquisition_sources_count'),
        rows: [{ count: 3187 }]
      }
    ]
  });

  assert.equal(report.summary.blockingCount, 2);
  assert.equal(report.summary.warningCount, 1);
  assert.equal(report.summary.status, 'blocked');
  assert.equal(report.summary.passCount, 3);
  assert.equal(report.summary.infoCount, 0);
  assert.ok(report.checks.every((check) => Object.hasOwn(check, 'id')));
  assert.ok(report.checks.every((check) => Object.hasOwn(check, 'status')));
  assert.ok(report.checks.every((check) => Object.hasOwn(check, 'message')));
  assert.ok(report.checks.every((check) => Object.hasOwn(check, 'reportPath')));
  assert.equal(report.checks.find((check) => check.id === 'maint_item_sources_vs_item_source_facts').status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'shop_relation_orphans').status, 'pass');
  assert.equal(report.checks.find((check) => check.id === 'projection_npcs_shop_items_nonempty').status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'unresolved_item_npc_relation_audits').status, 'warn');
  assert.equal(report.checks.find((check) => check.id === 'local_compat_item_acquisition_sources_count').status, 'pass');
});

test('buildRelationHealthReport keeps warning-only reports non-blocking', () => {
  const queries = buildRelationHealthQueries();
  const queryMap = new Map(queries.map((query) => [query.id, query]));

  const report = buildRelationHealthReport({
    checks: [
      {
        definition: queryMap.get('unresolved_item_npc_relation_audits'),
        rows: [{ count: 2602 }]
      },
      {
        definition: queryMap.get('shop_relation_orphans'),
        rows: [{ count: 0 }]
      }
    ]
  });

  assert.equal(report.summary.status, 'warning');
  assert.equal(report.summary.blockingCount, 0);
  assert.equal(report.summary.warningCount, 1);
});

test('buildRelationHealthReport exposes reportPath contract for report-backed checks', () => {
  const queries = buildRelationHealthQueries();
  const queryMap = new Map(queries.map((query) => [query.id, query]));

  const report = buildRelationHealthReport({
    checks: [
      {
        definition: queryMap.get('relation_exportable_reports_latest'),
        rows: [
          { reportKind: 'audit_json', count: 1, latestReportPath: 'reports/relation/audit.json' },
          { reportKind: 'audit_md', count: 1, latestReportPath: 'reports/relation/audit.md' },
          { reportKind: 'conflicts_json', count: 1, latestReportPath: 'reports/relation/conflicts.json' },
          { reportKind: 'unresolved_json', count: 1, latestReportPath: 'reports/relation/unresolved.json' }
        ]
      },
      {
        definition: queryMap.get('shop_relation_orphans'),
        rows: [{ count: 0 }]
      }
    ]
  });

  assert.equal(report.checks.find((check) => check.id === 'relation_exportable_reports_latest').reportPath, 'reports/relation/unresolved.json');
  assert.equal(report.checks.find((check) => check.id === 'shop_relation_orphans').reportPath, null);
});

test('buildRelationHealthReport blocks on empty standalone local compatibility outputs', () => {
  const queries = buildRelationHealthQueries();
  const queryMap = new Map(queries.map((query) => [query.id, query]));

  const report = buildRelationHealthReport({
    checks: [
      {
        definition: queryMap.get('local_compat_npc_shop_entries_count'),
        rows: [{ count: 0 }]
      }
    ]
  });

  assert.equal(report.summary.status, 'blocked');
  assert.equal(report.summary.blockingCount, 1);
  assert.equal(report.checks[0].status, 'fail');
});

test('buildRelationHealthReport accepts zero local shop conditions when relation expects none', () => {
  const queries = buildRelationHealthQueries();
  const queryMap = new Map(queries.map((query) => [query.id, query]));

  const report = buildRelationHealthReport({
    checks: [
      {
        definition: queryMap.get('local_compat_npc_shop_conditions_count'),
        rows: [{ expectedCount: 0, localCount: 0, delta: 0 }]
      }
    ]
  });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.blockingCount, 0);
  assert.equal(report.checks[0].status, 'pass');
  assert.equal(report.checks[0].message, 'delta is 0');
});

test('buildRelationHealthReport blocks when local shop condition count diverges from relation expected count', () => {
  const queries = buildRelationHealthQueries();
  const queryMap = new Map(queries.map((query) => [query.id, query]));

  const report = buildRelationHealthReport({
    checks: [
      {
        definition: queryMap.get('local_compat_npc_shop_conditions_count'),
        rows: [{ expectedCount: 13, localCount: 0, delta: 13 }]
      }
    ]
  });

  assert.equal(report.summary.status, 'blocked');
  assert.equal(report.summary.blockingCount, 1);
  assert.equal(report.checks[0].status, 'fail');
  assert.equal(report.checks[0].message, 'expected delta 0, got 13');
});

test('formatValidationChecklist gives the coordinator a serial dry-run/apply sequence', () => {
  const checklist = formatValidationChecklist({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local'
  });

  assert.match(checklist, /Do not run two DB apply scripts in parallel/);
  assert.match(checklist, /Check active writers before any dry-run or apply/);
  assert.match(checklist, /audit-source-dataset-landings\.mjs/);
  assert.match(checklist, /source-dataset-landing-audit-YYYY-MM-DD\.json/);
  assert.match(checklist, /node scripts\/data\/fetch\/build-npc-item-relations-bundle\.mjs/);
  assert.match(checklist, /node scripts\/data\/maint\/sync-landing-to-maint\.mjs --apply=false/);
  assert.match(checklist, /node scripts\/data\/relation\/sync-maint-to-relation\.mjs --apply=true/);
  assert.match(checklist, /node scripts\/data\/relation\/sync-projection-to-local-core-tables\.mjs --apply=true/);
  assert.match(checklist, /node scripts\/data\/relation\/sync-relation-to-local-compat-tables\.mjs --apply=true/);
  assert.match(checklist, /node scripts\/data\/relation\/relation-health-report\.mjs/);
  assert.match(checklist, /node scripts\/data\/relation\/replacement-readiness-audit\.mjs/);
  assert.match(checklist, /node scripts\/data\/relation\/local-core-compat-smoke-check\.mjs/);
  assert.match(checklist, /maint_backfill_candidates remains maint-owned/);
  assert.match(checklist, /item_npc_relation_audits and relation report exports/);
  assert.match(checklist, /Human approval is required before each apply command/);

  assert.ok(checklist.indexOf('sync-maint-to-relation.mjs --apply=false') < checklist.indexOf('relation-health-report.mjs'));
  assert.ok(checklist.indexOf('relation-health-report.mjs') < checklist.indexOf('replacement-readiness-audit.mjs'));
  assert.ok(checklist.indexOf('replacement-readiness-audit.mjs') < checklist.indexOf('local-core-compat-smoke-check.mjs'));
  assert.ok(checklist.indexOf('local-core-compat-smoke-check.mjs') < checklist.indexOf('sync-landing-to-maint.mjs --apply=true'));
});

test('resolveMysqlRequirePath anchors mysql2 resolution to data-query-app package.json', () => {
  assert.match(resolveMysqlRequirePath(), /data-query-app[\\/]package\.json$/);
});
