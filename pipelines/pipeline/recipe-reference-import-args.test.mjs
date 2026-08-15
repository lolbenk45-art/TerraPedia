import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildRecipeReferenceImportArgs } from './recipe-reference-import-args.mjs';
import {
  buildRecipeReferencePipelineImportArgs,
  ensureRecipeReferenceItemsInput
} from './run-recipe-reference-sync-pipeline.mjs';

test('buildRecipeReferenceImportArgs defaults to import script dry-run mode', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({}, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('buildRecipeReferencePipelineImportArgs only enables writes for apply=true', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({ apply: 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=true']
  );
});

test('buildRecipeReferencePipelineImportArgs lets dry-run override apply', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({ apply: 'true', 'dry-run': 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('buildRecipeReferencePipelineImportArgs preserves import dry-run override', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({ apply: 'true', importDryRun: 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('buildRecipeReferenceImportArgs keeps legacy helper default output', () => {
  assert.deepEqual(
    buildRecipeReferenceImportArgs({}, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json']
  );
});

test('buildRecipeReferenceImportArgs passes apply=false for import dry-run mode', () => {
  assert.deepEqual(
    buildRecipeReferenceImportArgs({ importDryRun: 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('ensureRecipeReferenceItemsInput normalizes default items input from raw wiki module', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-reference-items-input-'));
  const rawPath = path.join(tempDir, 'raw', 'wiki', 'module__iteminfo__data.latest.json');
  const inputPath = path.join(tempDir, 'normalized', 'items.wiki.json');
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, JSON.stringify({
    apiUrl: 'https://terraria.wiki.gg/api.php',
    pageTitle: 'Module:Iteminfo/data',
    revisionId: 456,
    revisionTimestamp: '2026-06-20T00:00:00Z',
    fetchedAt: '2026-06-20T00:00:00.000Z',
    moduleContent: 'return { ["data"] = [=[{ "_terrariaversion": "1.4.4.9", "1": { "name": "Iron Pickaxe", "internalName": "IronPickaxe", "pick": 40, "maxStack": 1 } }]=] }'
  }), 'utf8');

  const result = ensureRecipeReferenceItemsInput({
    inputPath,
    rawItemModulePath: rawPath,
    explicitInput: false,
    env: {
      ...process.env,
      TERRAPEDIA_SHARED_DATA_ROOT: tempDir
    }
  });

  assert.equal(result.inputPath, inputPath);
  assert.equal(result.normalizedFromRaw, true);
  assert.equal(fs.existsSync(inputPath), true);
  const normalized = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  assert.equal(normalized.totalItems, 1);
  assert.equal(normalized.items[0].internalName, 'IronPickaxe');
});

test('ensureRecipeReferenceItemsInput fails clearly when default items input and raw module are missing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-reference-items-missing-'));
  const inputPath = path.join(tempDir, 'normalized', 'items.wiki.json');
  const rawPath = path.join(tempDir, 'raw', 'wiki', 'module__iteminfo__data.latest.json');

  assert.throws(
    () => ensureRecipeReferenceItemsInput({
      inputPath,
      rawItemModulePath: rawPath,
      explicitInput: false
    }),
    /物品模块同步|wiki-items-refresh|items\.wiki\.json/
  );
});
