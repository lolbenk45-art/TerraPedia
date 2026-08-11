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

test('shimmer transform carries no implicit database or live langlink coupling', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  for (const forbidden of [
    'createRequire',
    'loadLocalStackConfig',
    'enrichLookupsFromDb',
    'fetchEnglishLanglinks'
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `offline shimmer transform must not reference ${forbidden}`
    );
  }
});

test('shimmer transform rejects the removed db lookup switch', () => {
  const fixture = writeFixture('reject-db-lookup');

  const result = runTransform(fixture, ['--use-db-lookup=true']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /use-db-lookup|database lookup/i);
});

test('shimmer transform requires frozen langlink evidence', () => {
  const fixture = writeFixture('require-langlinks');

  const result = runTransform(fixture, [], { includeLanglinks: false });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /langlink/i);
});

test('shimmer transform runs offline from frozen langlink evidence', () => {
  const fixture = writeFixture('offline-run');

  const result = runTransform(fixture, []);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixture.outputDir, 'wiki-shimmer-manifest.latest.json'), 'utf8')
  );
  assert.equal(manifest.outputs.contextRecords, 1);
  for (const shard of [
    'wiki-shimmer-context.importable.latest.json',
    'wiki-shimmer-item-transforms.importable.latest.json',
    'wiki-shimmer-decraft-rules.importable.latest.json',
    'wiki-shimmer-entity-transforms.importable.latest.json',
    'wiki-shimmer-npc-transforms.importable.latest.json'
  ]) {
    assert.ok(fs.existsSync(path.join(fixture.outputDir, shard)), `missing shard ${shard}`);
  }
});

function writeFixture(label) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-shimmer-${label}-`));
  const fixture = {
    tempDir,
    inputPath: path.join(tempDir, 'wiki-shimmer.latest.json'),
    outputDir: path.join(tempDir, 'out'),
    reportPath: path.join(tempDir, 'summary.md'),
    itemsPath: path.join(tempDir, 'items.standardized.json'),
    npcsPath: path.join(tempDir, 'npcs.standardized.json'),
    langlinksPath: path.join(tempDir, 'langlinks.frozen.json')
  };
  fs.writeFileSync(fixture.inputPath, JSON.stringify({
    pageTitle: 'Shimmer',
    pageId: 123,
    revisionTimestamp: '2026-05-20T00:00:00Z',
    html: buildMinimalShimmerHtml()
  }), 'utf8');
  fs.writeFileSync(fixture.itemsPath, JSON.stringify({
    records: [
      { name: 'Stone Block', internalName: 'StoneBlock' },
      { name: 'Dirt Block', internalName: 'DirtBlock' },
      { name: 'Gel', internalName: 'Gel' }
    ]
  }), 'utf8');
  fs.writeFileSync(fixture.npcsPath, JSON.stringify({
    records: [
      { name: 'Blue Slime', internalName: 'BlueSlime' },
      { name: 'Guide', internalName: 'Guide' }
    ]
  }), 'utf8');
  fs.writeFileSync(fixture.langlinksPath, JSON.stringify({
    records: [
      { nameZh: 'Stone Block', nameEn: 'Stone Block' },
      { nameZh: 'Dirt Block', nameEn: 'Dirt Block' },
      { nameZh: 'Blue Slime', nameEn: 'Blue Slime' },
      { nameZh: 'Guide', nameEn: 'Guide' }
    ]
  }), 'utf8');
  return fixture;
}

function runTransform(fixture, extraArgs, { includeLanglinks = true } = {}) {
  return spawnSync(process.execPath, [
    scriptPath,
    `--input=${fixture.inputPath}`,
    `--output=${fixture.outputDir}`,
    `--report-output=${fixture.reportPath}`,
    `--items=${fixture.itemsPath}`,
    `--npcs=${fixture.npcsPath}`,
    ...(includeLanglinks ? [`--langlinks=${fixture.langlinksPath}`] : []),
    '--generated-at=2026-07-30T12:00:00.000Z',
    ...extraArgs
  ], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } });
}

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
