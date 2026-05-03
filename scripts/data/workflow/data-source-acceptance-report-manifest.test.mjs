import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { buildDataSourceAcceptanceReportManifest } from './data-source-acceptance-report-manifest.mjs';

const execFileAsync = promisify(execFile);

const EXPECTED_PANEL_IDS = [
  'relationHealth',
  'replacementReadiness',
  'sourceDatasetLanding',
  'sourceGroupAudit',
  'imageReadiness',
  'crawlerMonitor',
  'entitySourceCoverage',
];

const DANGEROUS_COMMAND_PATTERNS = [
  /--apply=true/i,
  /\bimport\b/i,
  /\bbackfill\b/i,
  /\bapply\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brm\b/i,
  /\bcrawl\b/i,
  /\bload\b/i,
];

test('buildDataSourceAcceptanceReportManifest covers all acceptance overview panels', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();

  assert.ok(Array.isArray(manifest));
  assert.deepEqual(
    manifest.map((entry) => entry.panelId).sort(),
    [...EXPECTED_PANEL_IDS].sort(),
  );
  for (const entry of manifest) {
    assert.equal(typeof entry.panelId, 'string');
    assert.equal(typeof entry.reportPattern, 'string');
    assert.equal(typeof entry.generatorCommand, 'string');
    assert.equal(typeof entry.writesDatabase, 'boolean');
    assert.equal(typeof entry.requiresDatabase, 'boolean');
    assert.equal(typeof entry.notes, 'string');
    assert.equal(typeof entry.freshnessSource, 'string');
    assert.ok('staleAfterHours' in entry, `${entry.panelId} should declare staleAfterHours`);
    assert.ok(Array.isArray(entry.nextEvidenceWhen), `${entry.panelId} should declare nextEvidenceWhen`);
    assert.equal(typeof entry.statusImpact, 'string');
  }
});

test('manifest keeps every generator read-only and free of dangerous operations', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();

  for (const entry of manifest) {
    assert.equal(entry.writesDatabase, false, `${entry.panelId} must be read-only`);
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      assert.doesNotMatch(entry.generatorCommand, pattern, `${entry.panelId} command must not match ${pattern}`);
    }
  }
});

test('image readiness generator uses the database source explicitly', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();
  const imageReadiness = manifest.find((entry) => entry.panelId === 'imageReadiness');

  assert.ok(imageReadiness, 'imageReadiness manifest entry should be present');
  assert.equal(imageReadiness.requiresDatabase, true);
  assert.equal(imageReadiness.writesDatabase, false);
  assert.match(imageReadiness.generatorCommand, /\s--source=db\b/);
});

test('manifest metadata stays aligned with the backend acceptance overview contract', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();
  const backendSource = readFileSync(
    'back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java',
    'utf8',
  );

  assert.deepEqual(toComparableManifest(manifest), extractBackendPanelMetadata(backendSource));
});

test('manifest declares backend freshness policy for acceptance evidence', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();

  for (const entry of manifest.filter((item) => item.panelId !== 'crawlerMonitor')) {
    assert.equal(entry.freshnessSource, 'report-generatedAt-or-mtime', `${entry.panelId} freshness source`);
    assert.equal(entry.staleAfterHours, 24, `${entry.panelId} stale threshold`);
    assert.deepEqual(
      entry.nextEvidenceWhen,
      ['missing', 'stale', 'unknown', 'unreadable'],
      `${entry.panelId} next evidence triggers`,
    );
    assert.equal(entry.statusImpact, 'stale-pass-to-warning', `${entry.panelId} status impact`);
  }

  const crawlerMonitor = manifest.find((entry) => entry.panelId === 'crawlerMonitor');
  assert.ok(crawlerMonitor, 'crawlerMonitor manifest entry should be present');
  assert.equal(crawlerMonitor.freshnessSource, 'crawler-monitor');
  assert.equal(crawlerMonitor.staleAfterHours, 'crawler-refresh-threshold');
  assert.deepEqual(crawlerMonitor.nextEvidenceWhen, ['missing', 'stale', 'unknown', 'unreadable']);
  assert.equal(crawlerMonitor.statusImpact, 'stale-pass-to-warning');
});

test('CLI prints legal JSON and does not execute subcommands', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['scripts/data/workflow/data-source-acceptance-report-manifest.mjs'],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  const parsed = JSON.parse(stdout);
  assert.deepEqual(parsed, buildDataSourceAcceptanceReportManifest());
});

test('freshness audit CLI consumes the manifest builder instead of duplicating panel metadata', () => {
  const auditSource = readFileSync(
    'scripts/data/workflow/data-source-acceptance-freshness-audit.mjs',
    'utf8',
  );

  assert.match(auditSource, /buildDataSourceAcceptanceReportManifest/);
  for (const panelId of EXPECTED_PANEL_IDS) {
    assert.doesNotMatch(auditSource, new RegExp(`panelId:\\s*['"]${panelId}['"]`));
  }
});

function toComparableManifest(manifest) {
  return Object.fromEntries(
    manifest
      .map((entry) => [
        entry.panelId,
        {
          reportPattern: entry.reportPattern,
          generatorCommand: entry.generatorCommand,
          writesDatabase: entry.writesDatabase,
          requiresDatabase: entry.requiresDatabase,
          notes: entry.notes,
          freshnessSource: entry.freshnessSource,
          staleAfterHours: entry.staleAfterHours,
          nextEvidenceWhen: entry.nextEvidenceWhen,
          statusImpact: entry.statusImpact,
        },
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function extractBackendPanelMetadata(source) {
  const metadata = {};
  const definitionPattern =
    /new ReportDefinition\(\s*"([^"]+)",\s*Path\.of\([^)]*\),\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)",\s*"([^"]+)",\s*(true|false),\s*(true|false),\s*"([^"]+)"\s*\)/g;
  for (const match of source.matchAll(definitionPattern)) {
    metadata[match[1]] = {
      reportPattern: match[2],
      generatorCommand: match[3],
      writesDatabase: match[4] === 'true',
      requiresDatabase: match[5] === 'true',
      notes: match[6],
      freshnessSource: 'report-generatedAt-or-mtime',
      staleAfterHours: extractDefaultStaleAfterHours(source),
      nextEvidenceWhen: ['missing', 'stale', 'unknown', 'unreadable'],
      statusImpact: 'stale-pass-to-warning',
    };
  }

  const crawlerBlock = source.match(/private DataSourceAcceptanceOverviewDTO\.AcceptancePanelDTO buildCrawlerMonitorPanel\(\) \{([\s\S]*?)try \{/);
  assert.ok(crawlerBlock, 'crawler monitor panel block should be present');
  metadata.crawlerMonitor = {
    reportPattern: extractSetterString(crawlerBlock[1], 'setReportPattern'),
    generatorCommand: extractSetterString(crawlerBlock[1], 'setGeneratorCommand'),
    writesDatabase: extractSetterBoolean(crawlerBlock[1], 'setWritesDatabase'),
    requiresDatabase: extractSetterBoolean(crawlerBlock[1], 'setRequiresDatabase'),
    notes: extractSetterString(crawlerBlock[1], 'setNotes'),
    freshnessSource: 'crawler-monitor',
    staleAfterHours: 'crawler-refresh-threshold',
    nextEvidenceWhen: ['missing', 'stale', 'unknown', 'unreadable'],
    statusImpact: 'stale-pass-to-warning',
  };

  return Object.fromEntries(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right)));
}

function extractSetterString(source, setterName) {
  const match = source.match(new RegExp(`${setterName}\\("([^"]+)"\\)`));
  assert.ok(match, `${setterName} string value should be present`);
  return match[1];
}

function extractSetterBoolean(source, setterName) {
  const match = source.match(new RegExp(`${setterName}\\((true|false)\\)`));
  assert.ok(match, `${setterName} boolean value should be present`);
  return match[1] === 'true';
}

function extractDefaultStaleAfterHours(source) {
  const match = source.match(/DEFAULT_STALE_AFTER_HOURS\s*=\s*(\d+)/);
  assert.ok(match, 'DEFAULT_STALE_AFTER_HOURS should be present');
  return Number(match[1]);
}
