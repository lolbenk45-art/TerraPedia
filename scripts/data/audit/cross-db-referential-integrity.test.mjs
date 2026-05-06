import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCrossDbReferentialIntegrityQueries,
  buildCrossDbReferentialIntegrityReport,
  parseArgs,
} from './cross-db-referential-integrity.mjs';

test('parseArgs defaults cross-db referential integrity audit to quick mode', () => {
  assert.deepEqual(parseArgs([]), {
    landingDatabase: 'terria_v1_maint',
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
    mode: 'quick',
    sampleLimit: 20,
    recentDays: 7,
    writeReport: true,
    output: null,
    dateTag: new Date().toISOString().slice(0, 10),
  });
});

test('buildCrossDbReferentialIntegrityQueries emits SELECT-only checks across landing maint relation local', () => {
  const queries = buildCrossDbReferentialIntegrityQueries();

  assert.ok(queries.length >= 8);
  assert.ok(queries.every((query) => query.sql.trimStart().toUpperCase().startsWith('SELECT')));
  assert.ok(queries.every((query) => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE)\b/i.test(query.sql)));

  const byId = new Map(queries.map((query) => [query.id, query.sql]));
  assert.match(byId.get('maint_items_missing_current_landing'), /source_dataset_landings/);
  assert.match(byId.get('maint_item_sources_missing_relation_facts'), /item_source_facts/);
  assert.match(byId.get('relation_shop_missing_local_entries'), /npc_shop_entries/);
  assert.match(byId.get('relation_loot_missing_local_entries'), /npc_loot_entries/);
  assert.match(byId.get('local_npc_shop_conditions_orphans'), /npc_shop_conditions/);
});

test('quick mode adds recent-day filters while full mode removes them', () => {
  const quickQueries = buildCrossDbReferentialIntegrityQueries({ mode: 'quick', recentDays: 7 });
  const fullQueries = buildCrossDbReferentialIntegrityQueries({ mode: 'full', recentDays: 7 });

  assert.match(quickQueries[0].sql, /DATE_SUB\(UTC_TIMESTAMP\(\), INTERVAL 7 DAY\)/);
  assert.doesNotMatch(fullQueries[0].sql, /DATE_SUB\(UTC_TIMESTAMP\(\), INTERVAL 7 DAY\)/);
});

test('buildCrossDbReferentialIntegrityReport classifies fail warn and pass checks', () => {
  const definitions = buildCrossDbReferentialIntegrityQueries();
  const byId = new Map(definitions.map((query) => [query.id, query]));

  const report = buildCrossDbReferentialIntegrityReport({
    mode: 'quick',
    checks: [
      { definition: byId.get('maint_items_missing_current_landing'), rows: [{ count: 2 }] },
      { definition: byId.get('relation_shop_missing_local_entries'), rows: [{ count: 3 }] },
      { definition: byId.get('local_npc_loot_orphans'), rows: [{ count: 0 }] },
    ],
  });

  assert.equal(report.summary.status, 'blocked');
  assert.equal(report.summary.blockingCount, 1);
  assert.equal(report.summary.warningCount, 1);
  assert.equal(report.summary.passCount, 1);
  assert.equal(report.checks.find((check) => check.id === 'maint_items_missing_current_landing').status, 'fail');
  assert.equal(report.checks.find((check) => check.id === 'relation_shop_missing_local_entries').status, 'warn');
  assert.equal(report.checks.find((check) => check.id === 'local_npc_loot_orphans').status, 'pass');
});
