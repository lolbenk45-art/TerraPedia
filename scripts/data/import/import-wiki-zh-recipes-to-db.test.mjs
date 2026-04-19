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
const scriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-wiki-zh-recipes-to-db.mjs');

test('import-wiki-zh-recipes-to-db dry-run counts environment relations from environment recipe pages', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recipe-import-'));
  const inputPath = path.join(tempDir, 'sample.json');

  const payload = {
    records: [
      {
        pageTitle: '配方/蜂蜜',
        revisionTimestamp: '2026-04-20T00:00:00Z',
        recipeTables: [
          {
            caption: '蜂蜜',
            stations: ['蜂蜜'],
            stationRequirementMode: 'single',
            rows: [
              {
                resultName: '瓶装蜂蜜',
                resultQuantity: 1,
                versionScope: null,
                ingredients: [
                  { name: '玻璃瓶', quantity: null, text: '玻璃瓶', linkedTitles: ['玻璃瓶'] }
                ]
              }
            ]
          },
        ]
      },
      {
        pageTitle: '配方/水',
        revisionTimestamp: '2026-04-20T00:00:00Z',
        recipeTables: [
          {
            caption: '水晶球 和 水 或 水槽',
            stations: ['水晶球', '水', '水槽'],
            stationRequirementMode: 'combination',
            rows: [
              {
                resultName: '水蜡烛',
                resultQuantity: 1,
                versionScope: null,
                ingredients: [
                  { name: '蜡烛', quantity: null, text: '蜡烛', linkedTitles: ['蜡烛'] }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--input=${inputPath}`,
    '--dry-run=true',
    '--database=terria_v1_local',
    '--host=127.0.0.1',
    '--port=3306',
    '--user=root',
    '--password=root'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(String(result.stdout || '{}').trim());
  assert.equal(summary.environmentRelationRows, 2);
  assert.equal(summary.alternativeStationRows, 1);
});
