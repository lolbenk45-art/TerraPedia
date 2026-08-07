import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('recipe pipeline database stages resolve mysql2 through the declared package loader', () => {
  const stages = [
    'scripts/data/import/import-wiki-zh-recipes-to-db.mjs',
    'scripts/data/backfill/backfill-recipe-zh-display-names.mjs',
    'scripts/data/sync/consolidate-recipe-provider-priority.mjs',
  ];

  for (const relativePath of stages) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs';/);
    assert.match(source, /const mysql = loadMysqlModule\(\);/);
    assert.doesNotMatch(source, /createRequire\(import\.meta\.url\)/);
  }
});

test('recipe pipeline forwards the isolated database guard override to every write stage', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs'), 'utf8');
  assert.equal((source.match(/importArgs\.push\('--allow-non-primary-db=true'\)/g) ?? []).length, 1);
  assert.equal((source.match(/backfillArgs\.push\('--allow-non-primary-db=true'\)/g) ?? []).length, 1);
  assert.equal((source.match(/consolidateArgs\.push\('--allow-non-primary-db=true'\)/g) ?? []).length, 1);
});

test('recipe pipeline forwards offline mode to the import stage', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs'), 'utf8');
  assert.match(source, /importArgs\.push\('--offline=true'\)/);
});

test('recipe import resolves metadata in bounded concurrent batches', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/data/import/import-wiki-zh-recipes-to-db.mjs'), 'utf8');
  assert.match(source, /const concurrency = 16/);
  assert.match(source, /Promise\.all\(batch\.map\(\(title\) => fetchNameMetadata\(title\)\)\)/);
});

test('recipe import batches child rows per recipe', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/data/import/import-wiki-zh-recipes-to-db.mjs'), 'utf8');
  assert.match(source, /recipe\.ingredients\.map\(\(\) => '\(\?, \?, \?, \?, \?, \?, \?, \?, \?\)'\)/);
  assert.match(source, /recipe\.stations\.map\(\(\) => '\(\?, \?, \?, \?, \?, \?, \?\)'\)/);
  assert.doesNotMatch(source, /for \(const ingredient of recipe\.ingredients\) \{\s*await connection\.execute/);
});
