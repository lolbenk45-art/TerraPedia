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

test('normalize-wiki-items preserves armor equipment slots', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-normalize-items-'));
  const inputPath = path.join(tempDir, 'module__iteminfo__data.latest.json');
  const outputPath = path.join(tempDir, 'items.wiki.json');
  const overridesPath = path.join(tempDir, 'category-overrides.json');

  writeJson(overridesPath, { exactInternalName: {}, exactName: {} });
  writeJson(inputPath, {
    apiUrl: 'https://terraria.wiki.gg/api.php',
    pageTitle: 'Module:Iteminfo/data',
    revisionTimestamp: '2026-04-26T00:00:00.000Z',
    fetchedAt: '2026-04-27T00:00:00.000Z',
    moduleContent: `return {
      ["data"] = [=[
        {
          "_terrariaversion": "1.4.4.9",
          "_generated": "2026-04-26",
          "727": {
            "name": "Wood Helmet",
            "internalName": "WoodHelmet",
            "headSlot": 52,
            "bodySlot": -1,
            "legSlot": -1,
            "defense": 1,
            "maxStack": 1
          }
        }
      ]=]
    }`
  });

  const result = spawnSync(
    process.execPath,
    [
      'scripts/data/normalize/normalize-wiki-items.mjs',
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      `--overrides=${overridesPath}`
    ],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(output.items.length, 1);
  assert.deepEqual(output.items[0].equipment, {
    headSlot: 52,
    bodySlot: null,
    legSlot: null
  });
});
