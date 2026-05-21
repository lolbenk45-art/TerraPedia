import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'transform-wiki-biomes-to-import.mjs');

test('transform passes through valid extracted biome image URLs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-transform-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    entity: 'wiki_biomes',
    generatedAt: '2026-05-20T00:00:00.000Z',
    overview: { title: 'Biomes' },
    derivedRecords: [],
    unresolved: [],
    records: [{
      topGroup: 'Surface and Underground',
      requestedTitle: 'Forest',
      title: 'Forest',
      revisionTimestamp: '2026-05-20T00:00:00Z',
      intro: 'The Forest is the central surface biome.',
      aliases: ['Forest'],
      iconUrl: 'https://terraria.wiki.gg/images/Forest_biome.png',
    }],
  }), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(generatedDir, 'wiki-biomes.importable.latest.json'), 'utf8'));
  assert.equal(output.biomes[0].iconUrl, 'https://terraria.wiki.gg/images/Forest_biome.png');
});
