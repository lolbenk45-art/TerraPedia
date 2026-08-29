import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  buildCrossDbReferentialIntegrityQueries,
  buildCrossDbReferentialIntegrityReport,
  parseArgs,
  resolveCrossDbConnectionConfig,
  writeCrossDbReport,
} from './cross-db-referential-integrity.mjs';

const execFileAsync = promisify(execFile);

test('parseArgs defaults cross-db referential integrity audit to quick mode', () => {
  assert.deepEqual(parseArgs([]), {
    landingDatabase: 'terria_v1_local',
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local',
    mode: 'quick',
    sampleLimit: 20,
    recentDays: 7,
    writeReport: true,
    output: null,
    noOverwrite: false,
    generatedAt: null,
    dateTag: new Date().toISOString().slice(0, 10),
  });
});

test('parseArgs preserves generatedAt for acceptance report timestamps', () => {
  assert.deepEqual(
    parseArgs([
      '--generated-at=2026-05-07T05:11:02.000Z',
      '--date-tag=2026-05-07',
    ]),
    {
      landingDatabase: 'terria_v1_local',
      maintDatabase: 'terria_v1_maint',
      relationDatabase: 'terria_v1_relation',
      localDatabase: 'terria_v1_local',
      mode: 'quick',
      sampleLimit: 20,
      recentDays: 7,
      writeReport: true,
      output: null,
      noOverwrite: false,
      generatedAt: '2026-05-07T05:11:02.000Z',
      dateTag: '2026-05-07',
    },
  );
});

test('parseArgs exposes the immutable report writer boundary', () => {
  assert.equal(parseArgs(['--output=reports/runtime/x.json', '--no-overwrite=true']).noOverwrite, true);
});

test('cross-db immutable writer confines output and rejects a second write', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-cross-db-writer-'));
  const output = 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/run-01/cross-db.json';
  const report = { generatedAt: '2026-05-07T05:11:02.000Z', summary: { status: 'warning' }, checks: [] };
  try {
    const written = await writeCrossDbReport(report, { repoRoot, output, noOverwrite: true });
    const firstBytes = await fs.readFile(written.jsonPath);
    await assert.rejects(
      writeCrossDbReport(report, { repoRoot, output, noOverwrite: true }),
      /exists|overwrite|immutable/i,
    );
    assert.deepEqual(await fs.readFile(written.jsonPath), firstBytes);
    await assert.rejects(
      writeCrossDbReport(report, { repoRoot, output: '../outside.json', noOverwrite: true }),
      /immutable|runtime|confined|invalid/i,
    );
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

test('cross-db immutable writer rejects a symbolic-link ancestor', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-cross-db-symlink-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-cross-db-outside-'));
  const link = path.join(repoRoot, 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/link');
  const output = 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/link/cross-db.json';
  try {
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(outside, link, 'dir');
    await assert.rejects(
      writeCrossDbReport({ generatedAt: '2026-05-07T05:11:02.000Z', summary: {}, checks: [] }, {
        repoRoot,
        output,
        noOverwrite: true,
      }),
      /symbolic|symlink|confinement|ancestor/i,
    );
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('resolveCrossDbConnectionConfig prefers explicit local runtime environment over missing config', () => {
  assert.deepEqual(
    resolveCrossDbConnectionConfig({
      config: {},
      env: {
        TERRAPEDIA_DB_HOST: '127.0.0.1',
        TERRAPEDIA_DB_PORT: '13306',
        TERRAPEDIA_DB_USERNAME: 'root',
        TERRAPEDIA_DB_PASSWORD: 'root',
      },
    }),
    {
      host: '127.0.0.1',
      port: 13306,
      user: 'root',
      password: 'root',
    },
  );
});

test('buildCrossDbReferentialIntegrityQueries emits SELECT-only checks across landing maint relation local', () => {
  const queries = buildCrossDbReferentialIntegrityQueries();

  assert.ok(queries.length >= 8);
  assert.ok(queries.every((query) => query.sql.trimStart().toUpperCase().startsWith('SELECT')));
  assert.ok(queries.every((query) => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE)\b/i.test(query.sql)));

  const byId = new Map(queries.map((query) => [query.id, query.sql]));
  assert.match(byId.get('maint_items_missing_current_landing'), /source_dataset_landings/);
  assert.match(byId.get('maint_items_missing_current_landing'), /l\.current_slot = 1/);
  assert.doesNotMatch(byId.get('maint_items_missing_current_landing'), /l\.is_current = 1/);
  assert.doesNotMatch(byId.get('maint_items_missing_current_landing'), /l\.deleted/);
  assert.match(byId.get('maint_item_sources_missing_relation_facts'), /item_source_facts/);
  assert.match(byId.get('relation_item_source_facts_missing_maint'), /maint_npc_crawler_facts/);
  assert.match(byId.get('relation_item_source_facts_missing_maint'), /source_maint_table = 'maint_npc_crawler_facts'/);
  assert.match(byId.get('relation_shop_missing_local_entries'), /npc_shop_entries/);
  assert.match(byId.get('relation_shop_missing_local_entries'), /BINARY li\.internal_name = BINARY r\.item_internal_name/);
  assert.doesNotMatch(byId.get('relation_shop_missing_local_entries'), /li\.source_id/);
  assert.match(byId.get('relation_loot_missing_local_entries'), /npc_loot_entries/);
  assert.match(byId.get('local_item_source_rows_missing_relation_trace'), /BINARY r\.source_provider = BINARY l\.source_provider/);
  assert.match(byId.get('local_npc_shop_conditions_orphans'), /npc_shop_conditions/);
  assert.doesNotMatch(byId.get('local_npc_shop_conditions_orphans'), /c\.deleted/);
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

test('query failures block the report and the default CLI exit status', async () => {
  const definitions = buildCrossDbReferentialIntegrityQueries();
  const report = buildCrossDbReferentialIntegrityReport({
    checks: [{
      definition: definitions[0],
      rows: [],
      error: new Error('schema drift'),
    }],
  });

  assert.equal(report.summary.status, 'blocked');
  assert.equal(report.summary.missingCount, 1);
  assert.deepEqual(report.blockingReasons, [
    'maint items missing current landing rows: schema drift',
  ]);

  const auditModule = await import('./cross-db-referential-integrity.mjs');
  assert.equal(typeof auditModule.crossDbAuditExitCode, 'function');
  assert.equal(auditModule.crossDbAuditExitCode(report), 1);
});

test('CLI prints JSON report to stdout instead of human text', async () => {
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        'pipelines/audit/cross-db-referential-integrity.mjs',
        '--mode=quick',
        '--write-report=false',
        '--generated-at=2026-05-07T00:00:00.000Z',
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERRAPEDIA_DB_HOST: '127.0.0.1',
          TERRAPEDIA_DB_PORT: '13306',
          TERRAPEDIA_DB_USERNAME: 'root',
          TERRAPEDIA_DB_PASSWORD: 'root',
        },
      },
    ));
  } catch (error) {
    stdout = error.stdout;
    stderr = error.stderr;
  }

  assert.equal(stderr, '');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mode, 'quick');
  assert.equal(parsed.generatedAt, '2026-05-07T00:00:00.000Z');
  assert.ok(parsed.summary);
  assert.ok(Array.isArray(parsed.checks));
});
