import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildDomainAcceptanceReportManifest } from './domain-acceptance-report-manifest.mjs';

const execFileAsync = promisify(execFile);

const EXPECTED_DOMAIN_IDS = [
  'armor_sets',
  'bosses',
  'buffs',
  'projectiles',
  'support.category',
  'support.item_group',
  'support.recipe',
  'support.shimmer',
  'support.town_npc_maintenance',
];

const DANGEROUS_COMMAND_PATTERNS = [
  /--apply=true/i,
  /--mode=apply/i,
  /\bimport\b/i,
  /\bbackfill\b/i,
  /\bapply\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brm\b/i,
  /\bcrawl\b/i,
  /\bload\b/i,
];

test('domain manifest registers every B-tier upgrade target', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  assert.ok(Array.isArray(manifest));
  assert.deepEqual(
    [...new Set(manifest.map((entry) => entry.domainId))].sort(),
    [...EXPECTED_DOMAIN_IDS].sort(),
  );
});

test('domain manifest entries declare safe freshness and evidence metadata', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  for (const entry of manifest) {
    assert.equal(typeof entry.domainId, 'string');
    assert.equal(typeof entry.panelId, 'string');
    assert.equal(typeof entry.reportPattern, 'string');
    assert.equal(typeof entry.generatorCommand, 'string');
    assert.equal(typeof entry.writesDatabase, 'boolean');
    assert.equal(typeof entry.requiresDatabase, 'boolean');
    assert.equal(typeof entry.notes, 'string');
    assert.equal(typeof entry.freshnessSource, 'string');
    assert.equal(entry.freshnessSource, 'report-generatedAt-or-mtime');
    assert.equal(entry.staleAfterHours, 24);
    assert.deepEqual(entry.nextEvidenceWhen, ['missing', 'stale', 'unknown', 'unreadable']);
    assert.equal(entry.statusImpact, 'stale-pass-to-warning');
  }
});

test('domain manifest generator commands are read-only and mutation-free', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  for (const entry of manifest) {
    assert.equal(entry.writesDatabase, false, `${entry.domainId}/${entry.panelId} must be read-only`);
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      assert.doesNotMatch(
        entry.generatorCommand,
        pattern,
        `${entry.domainId}/${entry.panelId} command must not match ${pattern}`,
      );
    }
  }
});

test('domain manifest generator command targets exist in the repository', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  for (const entry of manifest) {
    const scriptPath = extractNodeScriptPath(entry.generatorCommand);
    assert.ok(scriptPath, `${entry.domainId}/${entry.panelId} should call a node script`);
    assert.ok(
      fs.existsSync(path.resolve(scriptPath)),
      `${entry.domainId}/${entry.panelId} generator target should exist: ${scriptPath}`,
    );
  }
});

test('product domains get source relation image and public readiness panels', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const productDomains = ['bosses', 'buffs', 'projectiles', 'armor_sets'];

  for (const domainId of productDomains) {
    const panelIds = manifest
      .filter((entry) => entry.domainId === domainId)
      .map((entry) => entry.panelId)
      .sort();

    assert.deepEqual(panelIds, [
      'imageReadiness',
      'publicReadiness',
      'relationReadiness',
      'sourceReadiness',
    ]);
  }
});

test('support domains start with source readiness and blocking-gate panels', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const supportDomains = EXPECTED_DOMAIN_IDS.filter((domainId) => domainId.startsWith('support.'));

  for (const domainId of supportDomains) {
    const panelIds = manifest
      .filter((entry) => entry.domainId === domainId)
      .map((entry) => entry.panelId)
      .sort();

    assert.deepEqual(panelIds, ['blockingGate', 'sourceReadiness']);
  }
});

test('CLI prints legal JSON and does not execute evidence commands', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['scripts/data/workflow/domain-acceptance-report-manifest.mjs'],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), buildDomainAcceptanceReportManifest());
});

test('backend domain acceptance service mirrors manifest contract exactly', () => {
  const source = fs.readFileSync(
    'back/src/main/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImpl.java',
    'utf8',
  );
  const manifest = buildDomainAcceptanceReportManifest();
  const backendEntries = parseBackendManifestEntries(source);

  assert.deepEqual(backendEntries, manifest.map((entry) => ({
    domainId: entry.domainId,
    panelId: entry.panelId,
    reportPattern: entry.reportPattern,
    generatorCommand: entry.generatorCommand,
    writesDatabase: entry.writesDatabase,
    requiresDatabase: entry.requiresDatabase,
    notes: entry.notes,
    staleAfterHours: entry.staleAfterHours,
  })));
});

function extractNodeScriptPath(command) {
  const match = String(command).match(/^node\s+([^\s]+\.mjs)\b/);
  return match?.[1] ?? null;
}

function parseBackendManifestEntries(source) {
  const staleAfterHours = Number(source.match(/DEFAULT_STALE_AFTER_HOURS\s*=\s*(\d+)/)?.[1]);
  const productDomains = parseJavaStringList(source, 'PRODUCT_DOMAIN_IDS');
  const supportDomains = parseJavaStringList(source, 'SUPPORT_DOMAIN_IDS');
  const productPanels = parsePanelDefinitions(source, 'PRODUCT_PANEL_DEFINITIONS');
  const supportPanels = parsePanelDefinitions(source, 'SUPPORT_PANEL_DEFINITIONS');
  return [
    ...productDomains.flatMap((domainId) => productPanels.map((panel) => backendEntry(domainId, panel, staleAfterHours))),
    ...supportDomains.flatMap((domainId) => supportPanels.map((panel) => backendEntry(domainId, panel, staleAfterHours))),
  ];
}

function parseJavaStringList(source, constantName) {
  const match = source.match(new RegExp(`${constantName}\\s*=\\s*List\\.of\\(([\\s\\S]*?)\\);`));
  assert.ok(match, `${constantName} should be declared as List.of(...)`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function parsePanelDefinitions(source, constantName) {
  const match = source.match(new RegExp(`${constantName}\\s*=\\s*List\\.of\\(([\\s\\S]*?)\\n\\s*\\);`));
  assert.ok(match, `${constantName} should be declared as List.of(...)`);
  return [...match[1].matchAll(/new PanelDefinition\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g)]
    .map((entry) => ({
      panelId: entry[1],
      fileKey: entry[2],
      generatorPanel: entry[3],
      notes: entry[4],
    }));
}

function backendEntry(domainId, panel, staleAfterHours) {
  return {
    domainId,
    panelId: panel.panelId,
    reportPattern: `reports/domain/${domainId}/${panel.fileKey}*.json`,
    generatorCommand: `node scripts/data/audit/domain-readiness-audit.mjs --domain=${domainId} --panel=${panel.generatorPanel}`,
    writesDatabase: false,
    requiresDatabase: false,
    notes: panel.notes,
    staleAfterHours,
  };
}
