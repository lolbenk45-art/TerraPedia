import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

test('standardize-existing-data carries item equipment slots into standardized records', () => {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-standardize-source-'));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-standardize-output-'));
  writeJson(path.join(sourceDir, 'normalized', 'items.wiki.json'), {
    source: 'terraria.wiki.gg:Module:Iteminfo/data',
    sourceApi: 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: 'Module:Iteminfo/data',
    sourceRevisionTimestamp: '2026-04-26T00:00:00.000Z',
    fetchedAt: '2026-04-27T00:00:00.000Z',
    wikiVersion: '1.4.4.9',
    moduleGeneratedAt: '2026-04-26',
    generatedAt: '2026-04-27T00:00:00.000Z',
    items: [
      {
        name: 'Wood Helmet',
        internalName: 'WoodHelmet',
        categoryCode: 'HELMET',
        equipment: {
          headSlot: 52,
          bodySlot: null,
          legSlot: null
        },
        defense: 1,
        stackSize: 1,
        isStackable: false,
        status: 1
      }
    ]
  });

  const result = spawnSync(
    process.execPath,
    ['scripts/data/transform/standardize-existing-data.mjs'],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
      env: {
        ...process.env,
        TERRAPEDIA_SOURCE_DATA_DIR: sourceDir,
        TERRAPEDIA_STANDARDIZED_OUTPUT_DIR: outputDir
      },
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(outputDir, 'items.standardized.json'), 'utf8'));
  assert.equal(output.records.length, 1);
  assert.deepEqual(output.records[0].equipment, {
    headSlot: 52,
    bodySlot: null,
    legSlot: null
  });
});
