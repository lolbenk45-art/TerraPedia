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
  assert.equal(report.summary.passCount, 2);
  assert.equal(report.summary.infoCount, 1);
  assert.equal(report.checks.find((check) => check.id === 'maint_item_sources_vs_item_source_facts').status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'shop_relation_orphans').status, 'pass');
  assert.equal(report.checks.find((check) => check.id === 'projection_npcs_shop_items_nonempty').status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'unresolved_item_npc_relation_audits').status, 'warn');
});

test('formatValidationChecklist gives the coordinator a serial dry-run/apply sequence', () => {
  const checklist = formatValidationChecklist({
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local'
  });

  assert.match(checklist, /Do not run two DB apply scripts in parallel/);
  assert.match(checklist, /node scripts\/data\/fetch\/build-npc-item-relations-bundle\.mjs/);
  assert.match(checklist, /node scripts\/data\/maint\/sync-landing-to-maint\.mjs --apply=false/);
  assert.match(checklist, /node scripts\/data\/relation\/sync-maint-to-relation\.mjs --apply=true/);
  assert.match(checklist, /node scripts\/data\/relation\/sync-projection-to-local-core-tables\.mjs --apply=true/);
  assert.match(checklist, /node scripts\/data\/relation\/sync-relation-to-local-compat-tables\.mjs --apply=true/);
  assert.match(checklist, /node scripts\/data\/relation\/relation-health-report\.mjs/);
  assert.match(checklist, /maint_backfill_candidates remains maint-owned/);
  assert.match(checklist, /item_npc_relation_audits and relation report exports/);
});

test('resolveMysqlRequirePath anchors mysql2 resolution to data-query-app package.json', () => {
  assert.match(resolveMysqlRequirePath(), /data-query-app[\\/]package\.json$/);
});
