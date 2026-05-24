import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'transform-wiki-shimmer-to-importable.mjs');

test('shimmer transform does not require mysql2 when db lookup is disabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-transform-no-db-'));
  const inputPath = path.join(tempDir, 'wiki-shimmer.latest.json');
  const outputDir = path.join(tempDir, 'out');
  const reportPath = path.join(tempDir, 'summary.md');
  const itemsPath = path.join(tempDir, 'items.standardized.json');
  const npcsPath = path.join(tempDir, 'npcs.standardized.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');

  fs.writeFileSync(inputPath, JSON.stringify({
    pageTitle: 'Shimmer',
    pageId: 123,
    revisionTimestamp: '2026-05-20T00:00:00Z',
    html: buildMinimalShimmerHtml()
  }), 'utf8');
  fs.writeFileSync(itemsPath, JSON.stringify({
    records: [
      { name: 'Stone Block', internalName: 'StoneBlock' },
      { name: 'Dirt Block', internalName: 'DirtBlock' },
      { name: 'Gel', internalName: 'Gel' }
    ]
  }), 'utf8');
  fs.writeFileSync(npcsPath, JSON.stringify({
    records: [
      { name: 'Blue Slime', internalName: 'BlueSlime' },
      { name: 'Guide', internalName: 'Guide' }
    ]
  }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ query: { pages: [] } }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--input=${inputPath}`,
    `--output=${outputDir}`,
    `--report-output=${reportPath}`,
    `--items=${itemsPath}`,
    `--npcs=${npcsPath}`,
    '--use-db-lookup=false'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifestPath = path.join(outputDir, 'wiki-shimmer-manifest.latest.json');
  assert.ok(fs.existsSync(manifestPath));
  assert.ok(fs.existsSync(reportPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.outputs.contextRecords, 1);
});

function buildMinimalShimmerHtml() {
  const item = '<span class="i"><a title="Stone Block">Stone Block</a></span>';
  const itemOut = '<span class="i"><a title="Dirt Block">Dirt Block</a></span>';
  const npc = '<span class="i"><a title="Blue Slime">Blue Slime</a></span>';
  const guide = '<span class="i"><a title="Guide">Guide</a></span>';
  const image = '<img src="/images/guide-shimmer.png" alt="Guide shimmer">';
  return [
    '<p>Shimmer intro.</p>',
    table('Item transforms', `<tr><td>${item}</td><td>${itemOut}</td><td></td></tr>`),
    table('Multi recipe decraft', `<tr><td>${item}</td><td>${itemOut}</td></tr>`),
    table('Evil branch decraft', `<tr><td>${item}</td><td>${itemOut}</td><td>${item}</td></tr>`),
    table('Unique decraft', `<tr><td>${item}</td><td>${itemOut}</td></tr>`),
    table('Random partial decraft', `<tr><td>${item}</td></tr>`),
    table('Skeletron locked decraft', `<tr><td>${item}</td></tr>`),
    table('Golem locked decraft', `<tr><td>${item}</td></tr>`),
    table('Not allowed decraft', `<tr><td>${item}</td></tr>`),
    table('Critter to item', `<tr><td>${npc}</td><td>${itemOut}</td></tr>`),
    table('Enemy transforms', `<tr><td>${npc}</td><td>${guide}</td></tr>`),
    table('Critter to faeling', `<tr><td>${npc}</td></tr>`),
    table('Slime to shimmer slime', `<tr><td>${npc}</td></tr>`),
    table('NPC transforms', `<tr><td>${guide}</td><td>${image}</td></tr>`)
  ].join('\n');
}

function table(caption, rows) {
  return `<table><caption>${caption}</caption>${rows}</table>`;
}
